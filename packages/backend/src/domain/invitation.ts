// An invitation to join a household, by email or shareable link (architecture §5.2, FR-01). The
// household comes from the invitation, never from the client.
import type { Id } from './id.js';

export type InvitationKind = 'email' | 'link';

export interface Invitation {
	id: Id;
	householdId: Id;
	kind: InvitationKind;
	/** Normalised. Email invitations only: whoever accepts must have this verified address. */
	email?: string;
	/** SHA-256 of the token in the link. The token itself is shown once and never stored. */
	tokenHash: string;
	expiresAt: Date;
	maxUses: number;
	useCount: number;
	revokedAt?: Date;
	createdBy: Id;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

/** How long a new invitation works (`ui.md` J1). */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Each invitation lets one person in; a link for two people is two links, each revocable. */
export const INVITATION_MAX_USES = 1;

export type InvitationState = 'open' | 'revoked' | 'used' | 'expired';

export function invitationState(invitation: Invitation, now: Date): InvitationState {
	if (invitation.revokedAt) return 'revoked';
	if (invitation.useCount >= invitation.maxUses) return 'used';
	return invitation.expiresAt <= now ? 'expired' : 'open';
}

/** Enough of an address to recognise it: `jane@gmail.com` → `j•••@gmail.com` (`ui.md` J2). */
export function maskEmail(email: string): string {
	const at = email.lastIndexOf('@');
	return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
