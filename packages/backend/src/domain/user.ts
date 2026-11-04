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
	/** What the household sees. The app owns it once the person sets it (§5.2). */
	displayName: string;
	displayNameSource: DisplayNameSource;
	avatarUrl?: string;
	deletedAt?: Date;
	/** Starts at 1 and goes up by one on every write; the ETag (architecture §3.3). */
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Where the display name came from: the provider's name, the email's local part (Auth0 has no
 * name for email/password sign-ups), or the person themselves.
 */
export type DisplayNameSource = 'provider' | 'email' | 'user';

export interface DisplayName {
	displayName: string;
	displayNameSource: DisplayNameSource;
}

export const DISPLAY_NAME_MAX = 100;

/**
 * Emails compare case-insensitively. Nothing else is folded (no Gmail dot or plus rules), so two
 * addresses only match when the provider would deliver to both as one.
 */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/** The name a provider's claims give: its name, else the email's local part. */
export function displayNameFor(name: string | undefined, email: string): DisplayName {
	const trimmed = name?.trim();
	if (trimmed && trimmed !== email) {
		return { displayName: trimmed.slice(0, DISPLAY_NAME_MAX), displayNameSource: 'provider' };
	}
	return {
		displayName: email.split('@')[0]!.slice(0, DISPLAY_NAME_MAX),
		displayNameSource: 'email'
	};
}

/**
 * The name to keep after a sign-in. Only a fallback from the email gives way, and only to a
 * provider's real name: otherwise each sign-in method would rename the person in turn, and a name
 * they chose would be lost.
 */
export function nameAfterSignIn(current: DisplayName, fromProvider: DisplayName): DisplayName {
	const upgrade =
		current.displayNameSource === 'email' && fromProvider.displayNameSource === 'provider';
	return upgrade ? fromProvider : current;
}

/**
 * A name the person typed: surrounding and repeated whitespace removed, 1 to 100 characters, no
 * control characters. Emoji are fine. Null when it isn't acceptable.
 */
export function cleanDisplayName(input: string): string | null {
	const name = input.normalize('NFC').trim().replace(/\s+/g, ' ');
	if (name.length === 0 || [...name].length > DISPLAY_NAME_MAX) return null;
	// Control characters, and the bidi controls that can make a name display as another.
	if (/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(name)) return null;
	return name;
}
