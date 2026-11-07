// Inviting people into a household and joining one (architecture §5.2, FR-01, scenarios 1 and 9).
// Any member can invite. A token is the only way to reach an invitation from outside the
// household, and the household to join always comes from the invitation it finds.
import { validationError } from '../../domain/errors.js';
import { isId, type Id } from '../../domain/id.js';
import {
	INVITATION_MAX_USES,
	INVITATION_TTL_MS,
	invitationState,
	maskEmail,
	type Invitation
} from '../../domain/invitation.js';
import { err, ok, type Result } from '../../domain/result.js';
import { hashSecretToken, isSecretToken, newSecretToken } from '../../domain/secret-token.js';
import { normaliseEmail } from '../../domain/user.js';
import type { MemberContext, MemberViewer, Viewer } from '../auth/auth.js';
import {
	conflictError,
	forbidden,
	notFound,
	rateLimited,
	unavailable,
	type ConflictError,
	type ForbiddenError,
	type NotFoundError,
	type RateLimitedError,
	type StaleVersionError,
	type UnavailableError,
	type ValidationError
} from '../errors.js';
import type { Ports } from '../ports/index.js';

export const JOIN_PATH = '/join/';

export interface InvitationView {
	invitation: Invitation;
	invitedBy: string;
	canRevoke: boolean;
}

export type JoinStatus =
	| 'open'
	| 'expired'
	| 'revoked'
	| 'used'
	| 'email-mismatch'
	| 'already-member'
	| 'in-another-household';

export interface JoinPreview {
	status: JoinStatus;
	signedIn: boolean;
	householdName?: string;
	emailHint?: string;
}

export interface InvitationsOptions {
	/** The origin invite links point at, e.g. `https://toebeans.co.za`. */
	publicOrigin: string;
}

export type Invitations = ReturnType<typeof createInvitations>;

const canRevoke = (invitation: Invitation, ctx: MemberContext) =>
	ctx.role === 'owner' || invitation.createdBy === ctx.userId;

/**
 * Whether this person can use the invitation, and why not. Being a member comes first: someone
 * reopening the link they joined with should hear that, not that it's used up.
 */
function joinStatus(invitation: Invitation, viewer: Viewer | null, now: Date): JoinStatus {
	if (viewer?.member?.householdId === invitation.householdId) return 'already-member';
	const state = invitationState(invitation, now);
	if (state !== 'open' || !viewer) return state;
	if (viewer.member) return 'in-another-household';
	// The email is the provider's verified one: sign-in refuses anything else (architecture §3.4).
	if (invitation.kind === 'email' && invitation.email !== viewer.email) return 'email-mismatch';
	return 'open';
}

export function createInvitations(
	{
		invitations,
		households,
		users,
		email,
		inviteEmailRateLimit,
		uow,
		clock,
		ids,
		logger
	}: Pick<
		Ports,
		| 'invitations'
		| 'households'
		| 'users'
		| 'email'
		| 'inviteEmailRateLimit'
		| 'uow'
		| 'clock'
		| 'ids'
		| 'logger'
	>,
	{ publicOrigin }: InvitationsOptions
) {
	const log = logger.child({ component: 'invitations' });

	const newInvitation = async (viewer: MemberViewer, address?: string) => {
		const token = newSecretToken();
		const invitation = await invitations.insert({
			id: ids.next(),
			householdId: viewer.member.householdId,
			kind: address ? 'email' : 'link',
			...(address && { email: address }),
			tokenHash: hashSecretToken(token),
			expiresAt: new Date(clock.now().getTime() + INVITATION_TTL_MS),
			maxUses: INVITATION_MAX_USES,
			createdBy: viewer.member.userId
		});
		return { invitation, url: `${publicOrigin}${JOIN_PATH}${token}` };
	};

	const viewOf = (invitation: Invitation, viewer: MemberViewer): InvitationView => ({
		invitation,
		invitedBy: viewer.displayName,
		canRevoke: canRevoke(invitation, viewer.member)
	});

	const invitationEmail = (viewer: MemberViewer, invitation: Invitation, url: string) => {
		const { householdName, timeZone } = viewer.member;
		const expires = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone }).format(
			invitation.expiresAt
		);
		return {
			to: invitation.email!,
			subject: `${viewer.displayName} invited you to ${householdName} on Toe Beans`,
			text: [
				`${viewer.displayName} has invited you to join ${householdName} on Toe Beans, to share a dog's training and care.`,
				`Accept the invitation: ${url}`,
				`It works once, until ${expires}, and only when you sign in with this email address. If you weren't expecting it, you can ignore this email.`
			].join('\n\n')
		};
	};

	return {
		/** A shareable link. `url` holds the token, and this is the only time it's available. */
		async createLink(viewer: MemberViewer): Promise<InvitationView & { url: string }> {
			const { invitation, url } = await newInvitation(viewer);
			log.info('invitation created', { householdId: invitation.householdId, kind: 'link' });
			return { ...viewOf(invitation, viewer), url };
		},

		/** Emails an invitation. If it can't be sent there's nothing to keep, so it's removed. */
		async createEmail(
			viewer: MemberViewer,
			input: { email: string }
		): Promise<Result<InvitationView, ValidationError | RateLimitedError | UnavailableError>> {
			const { householdId } = viewer.member;
			if (!inviteEmailRateLimit.take(householdId).allowed) {
				log.warn('invitation email rate limited', { householdId });
				return err(rateLimited);
			}
			const address = normaliseEmail(input.email);
			const invitee = await users.findByEmail(address);
			const household = invitee && (await households.find(householdId));
			if (household?.memberships.some((m) => m.userId === invitee?.id)) {
				return err(
					validationError('They are already a member.', {
						email: ['This person is already in your household.']
					})
				);
			}
			const { invitation, url } = await newInvitation(viewer, address);
			const sent = await email.send(invitationEmail(viewer, invitation, url));
			if (!sent.ok) {
				log.warn('invitation email failed', { householdId, reason: sent.error.reason });
				await invitations.remove(householdId, invitation.id);
				return err(unavailable("Couldn't send the email. Try again, or share a link instead."));
			}
			log.info('invitation created', { householdId, kind: 'email' });
			return ok(viewOf(invitation, viewer));
		},

		/** Invitations that can still be used. */
		async listOpen(ctx: MemberContext): Promise<InvitationView[]> {
			const open = await invitations.findOpen(ctx.householdId, clock.now());
			const people = await users.findByIds([...new Set(open.map((i) => i.createdBy))]);
			const names = new Map(people.map((u) => [u.id, u.displayName]));
			return open.map((invitation) => ({
				invitation,
				invitedBy: names.get(invitation.createdBy) ?? 'A former member',
				canRevoke: canRevoke(invitation, ctx)
			}));
		},

		/** An owner can revoke any invitation; a caregiver only their own. */
		async revoke(
			ctx: MemberContext,
			input: { id: string; expectedVersion: number }
		): Promise<Result<void, NotFoundError | ForbiddenError | StaleVersionError>> {
			const id = input.id;
			const invitation = isId(id) ? await invitations.findById(ctx.householdId, id) : null;
			if (!invitation) return err(notFound('invitation'));
			if (!canRevoke(invitation, ctx)) return err(forbidden);
			const revoked = await invitations.revoke(
				ctx.householdId,
				invitation.id,
				input.expectedVersion,
				clock.now()
			);
			if (!revoked.ok) return revoked;
			log.info('invitation revoked', { householdId: ctx.householdId });
			return ok(undefined);
		},

		/**
		 * What the join page shows. It works signed out, so that the person knows what they're
		 * signing in for (`ui.md` J2); the token is what allows it.
		 */
		async preview(
			token: string,
			viewer: Viewer | null
		): Promise<Result<JoinPreview, NotFoundError>> {
			const invitation = isSecretToken(token)
				? await invitations.findByTokenHash(hashSecretToken(token))
				: null;
			if (!invitation) return err(notFound('invitation'));
			const status = joinStatus(invitation, viewer, clock.now());
			const signedIn = viewer !== null;
			if (status === 'expired' || status === 'revoked' || status === 'used') {
				return ok({ status, signedIn });
			}
			const household = await households.find(invitation.householdId);
			if (!household) return err(notFound('invitation'));
			return ok({
				status,
				signedIn,
				householdName: household.name,
				...(status === 'email-mismatch' && { emailHint: maskEmail(invitation.email!) })
			});
		},

		/**
		 * Joins the invitation's household as a caregiver. Taking a use and adding the member are
		 * one transaction, so a failed join doesn't spend the invitation, and two people can't
		 * both take its last use. The conflict's reason is on the preview, which the page reloads.
		 */
		async accept(
			token: string,
			viewer: Viewer
		): Promise<Result<void, NotFoundError | ConflictError>> {
			if (!isSecretToken(token)) return err(notFound('invitation'));
			const { userId } = viewer.auth;
			const refused = conflictError('This invitation can no longer be accepted.');
			let joined: Id | undefined;
			const result = await uow.run<void, NotFoundError | ConflictError>(async () => {
				const invitation = await invitations.findByTokenHash(hashSecretToken(token));
				if (!invitation) return err(notFound('invitation'));
				const now = clock.now();
				if (joinStatus(invitation, viewer, now) !== 'open') return err(refused);
				const { householdId, id } = invitation;
				if (!(await invitations.claim(householdId, id, now))) return err(refused);
				const added = await households.addMember(
					householdId,
					{ userId, role: 'caregiver', joinedAt: now },
					now
				);
				if (!added.ok) return added;
				joined = householdId;
				return ok(undefined);
			});
			if (result.ok) log.info('invitation accepted', { householdId: joined, userId });
			return result;
		}
	};
}
