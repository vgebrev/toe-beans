// /api/v1/household and /api/v1/invitations (architecture §3.3, §5.2). Someone with no household
// gets a 404 from anything inside one, as if they'd asked for another household's data (§4.4).
import {
	CreateHousehold,
	CreateInvitation,
	type CreatedInvitation,
	type FormerHousehold,
	type Household as HouseholdDto,
	type Invitation as InvitationDto,
	type InvitationPreview,
	type Invitations as InvitationsDto
} from '@toe-beans/contracts';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { notFound, rateLimited } from '../application/errors.js';
import type { HouseholdView, Households } from '../application/household/household.js';
import type { InvitationView, Invitations } from '../application/household/invitations.js';
import type { Logger, RateLimiter } from '../application/ports/index.js';
import { etag, versionFromIfMatch } from './etag.js';
import { errorResponse, json, noContent, respond, type HttpResponse } from './response.js';
import { parseInput } from './validation.js';

export interface HouseholdHttpOptions {
	/** Looking at and accepting invitations, per client address (architecture §7). */
	rateLimit: RateLimiter;
	logger: Logger;
}

export interface HouseholdHttp {
	get(viewer: Viewer): Promise<HttpResponse>;
	create(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	/** Leaving, when the ID is the viewer's own. */
	removeMember(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null }
	): Promise<HttpResponse>;
	getFormer(viewer: Viewer): Promise<HttpResponse>;
	reactivate(viewer: Viewer): Promise<HttpResponse>;
	listInvitations(viewer: Viewer): Promise<HttpResponse>;
	createInvitation(viewer: Viewer, input: { body: unknown }): Promise<HttpResponse>;
	revokeInvitation(
		viewer: Viewer,
		input: { id: string; ifMatch: string | null }
	): Promise<HttpResponse>;
	/** The one route that works signed out, so `viewer` can be null. */
	previewInvitation(input: {
		token: string;
		viewer: Viewer | null;
		clientAddress: string;
	}): Promise<HttpResponse>;
	acceptInvitation(input: {
		token: string;
		viewer: Viewer;
		clientAddress: string;
	}): Promise<HttpResponse>;
}

const householdResponse =
	(status: number) =>
	({ version, members, ...rest }: HouseholdView): HttpResponse =>
		json(
			{
				...rest,
				members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }))
			} satisfies HouseholdDto,
			status,
			{ etag: etag(version) }
		);

const invitationDto = ({ invitation, invitedBy, canRevoke }: InvitationView): InvitationDto => ({
	id: invitation.id,
	kind: invitation.kind,
	...(invitation.email && { email: invitation.email }),
	expiresAt: invitation.expiresAt.toISOString(),
	invitedBy,
	canRevoke,
	etag: etag(invitation.version)
});

const isMember = (viewer: Viewer): viewer is MemberViewer => viewer.member !== null;
const noHousehold = () => errorResponse(notFound('household'));

export function createHouseholdHttp(
	households: Households,
	invitations: Invitations,
	{ rateLimit, logger }: HouseholdHttpOptions
): HouseholdHttp {
	const limited = (clientAddress: string) => {
		const decision = rateLimit.take(clientAddress);
		if (decision.allowed) return null;
		logger.warn('invitation rate limited', { retryAfterSeconds: decision.retryAfterSeconds });
		return errorResponse(rateLimited);
	};

	return {
		async get(viewer) {
			if (!isMember(viewer)) return noHousehold();
			return respond(await households.view(viewer.member), householdResponse(200));
		},

		async create(viewer, { body }) {
			const input = parseInput(CreateHousehold, body);
			if (!input.ok) return errorResponse(input.error);
			return respond(await households.create(viewer.auth, input.value), householdResponse(201));
		},

		async removeMember(viewer, { id, ifMatch }) {
			if (!isMember(viewer)) return noHousehold();
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const removed = await households.removeMember(viewer.member, {
				memberId: id,
				expectedVersion: version.value
			});
			return respond(removed, () => noContent());
		},

		async getFormer(viewer) {
			return respond(await households.findReactivatable(viewer.auth), (former) =>
				json(former satisfies FormerHousehold)
			);
		},

		async reactivate(viewer) {
			return respond(await households.reactivate(viewer.auth), householdResponse(200));
		},

		async listInvitations(viewer) {
			if (!isMember(viewer)) return noHousehold();
			const open = await invitations.listOpen(viewer.member);
			return json({ invitations: open.map(invitationDto) } satisfies InvitationsDto);
		},

		async createInvitation(viewer, { body }) {
			if (!isMember(viewer)) return noHousehold();
			const input = parseInput(CreateInvitation, body);
			if (!input.ok) return errorResponse(input.error);
			if (input.value.kind === 'email') {
				const sent = await invitations.createEmail(viewer, { email: input.value.email });
				return respond(sent, (view) => json(invitationDto(view), 201));
			}
			const { url, ...view } = await invitations.createLink(viewer);
			return json({ ...invitationDto(view), url } satisfies CreatedInvitation, 201);
		},

		async revokeInvitation(viewer, { id, ifMatch }) {
			if (!isMember(viewer)) return noHousehold();
			const version = versionFromIfMatch(ifMatch);
			if (!version.ok) return errorResponse(version.error);
			const revoked = await invitations.revoke(viewer.member, {
				id,
				expectedVersion: version.value
			});
			return respond(revoked, () => noContent());
		},

		async previewInvitation({ token, viewer, clientAddress }) {
			const refused = limited(clientAddress);
			if (refused) return refused;
			return respond(await invitations.preview(token, viewer), (preview) =>
				json(preview satisfies InvitationPreview)
			);
		},

		async acceptInvitation({ token, viewer, clientAddress }) {
			const refused = limited(clientAddress);
			if (refused) return refused;
			return respond(await invitations.accept(token, viewer), () => noContent());
		}
	};
}
