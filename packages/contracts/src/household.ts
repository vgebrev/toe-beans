// The household, its members and invitations: /api/v1/household and /api/v1/invitations
// (architecture §3.3, §5.2).
import { z } from 'zod';

export const Role = z.enum(['owner', 'caregiver']);
export type Role = z.infer<typeof Role>;

export const Member = z.object({
	id: z.string(),
	displayName: z.string(),
	role: Role,
	joinedAt: z.iso.datetime(),
	/** This member is the person asking. */
	you: z.boolean(),
	/** The rest say what the person asking may do here (architecture D19). */
	canRemove: z.boolean(),
	canMakeOwner: z.boolean(),
	/** On your own row, when another owner would stay. */
	canStepDown: z.boolean()
});
export type Member = z.infer<typeof Member>;

/** The ETag carries the version. */
export const Household = z.object({
	name: z.string(),
	timeZone: z.string(),
	members: z.array(Member)
});
export type Household = z.infer<typeof Household>;

export const ChangeMemberRole = z.strictObject({ role: Role });
export type ChangeMemberRole = z.infer<typeof ChangeMemberRole>;

/** What someone without a household can bring back: the one they were the last to leave. */
export const FormerHousehold = z.object({ name: z.string() });
export type FormerHousehold = z.infer<typeof FormerHousehold>;

/** Shape only; the backend tidies the name and checks the time zone. */
export const CreateHousehold = z.strictObject({
	name: z.string().max(500),
	timeZone: z.string().max(100)
});
export type CreateHousehold = z.infer<typeof CreateHousehold>;

/** An invitation that can still be used. The token isn't here: it's only shown at creation. */
export const Invitation = z.object({
	id: z.string(),
	kind: z.enum(['email', 'link']),
	email: z.string().optional(),
	expiresAt: z.iso.datetime(),
	invitedBy: z.string(),
	/** Whether the person asking may revoke it: an owner, or whoever made it. */
	canRevoke: z.boolean(),
	/** For If-Match when revoking. */
	etag: z.string()
});
export type Invitation = z.infer<typeof Invitation>;

export const Invitations = z.object({ invitations: z.array(Invitation) });
export type Invitations = z.infer<typeof Invitations>;

export const CreateInvitation = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('link') }),
	z.strictObject({
		kind: z.literal('email'),
		email: z.email('Enter a valid email address.').max(254)
	})
]);
export type CreateInvitation = z.infer<typeof CreateInvitation>;

/** The one time the link is available: only its hash is kept. */
export const CreatedInvitation = Invitation.extend({ url: z.url() });
export type CreatedInvitation = z.infer<typeof CreatedInvitation>;

/**
 * What `/join/:token` shows (`ui.md` J2). `open` can be accepted; everything else says why not.
 * A dead invitation doesn't name its household.
 */
export const InvitationPreview = z.object({
	status: z.enum([
		'open',
		'expired',
		'revoked',
		'used',
		'email-mismatch',
		'already-member',
		'in-another-household'
	]),
	signedIn: z.boolean(),
	householdName: z.string().optional(),
	/** With `open`: the dogs they'd help care for, not archived ones. */
	dogNames: z.array(z.string()).optional(),
	/** With `email-mismatch`: the address it was sent to, masked. */
	emailHint: z.string().optional()
});
export type InvitationPreview = z.infer<typeof InvitationPreview>;
