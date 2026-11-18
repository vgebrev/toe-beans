import type { Identity } from '../../domain/user.js';

/**
 * The person's accounts at the identity provider (S16.5, architecture D38): Auth0 keeps an email,
 * a name and, for email sign-ins, a password hash for each, until they're deleted there.
 */
export interface IdentityAccounts {
	/**
	 * Deletes the provider's account behind each identity it issued; others are skipped. One
	 * already gone is fine, so it can be called again. Throws if the provider can't be reached or
	 * refuses: the caller stops before deleting anything of its own, so the person can retry.
	 */
	delete(identities: readonly Identity[]): Promise<void>;
}
