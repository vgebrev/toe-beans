// A person who signs in (architecture §5.2). Not household-owned: households come in S2.
import type { Id } from './id.js';

/** One way of signing in: an OIDC issuer and that issuer's stable ID for the person. */
export interface Identity {
	issuer: string;
	subject: string;
	linkedAt: Date;
}

export interface User {
	id: Id;
	/**
	 * Every sign-in method that leads to this user. Google and email/password with the same
	 * verified email are separate identities of one user (§3.4).
	 */
	identities: Identity[];
	/** Verified by the identity provider, normalised, and unique across users. */
	email: string;
	displayName: string;
	avatarUrl?: string;
	deletedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Emails compare case-insensitively. Nothing else is folded (no Gmail dot or plus rules), so two
 * addresses only match when the provider would deliver to both as one.
 */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/** The name shown in the app: the provider's name, else the email's local part. */
export function displayNameFor(name: string | undefined, email: string): string {
	const trimmed = name?.trim();
	if (trimmed && trimmed !== email) return trimmed.slice(0, 100);
	return email.split('@')[0]!.slice(0, 100);
}
