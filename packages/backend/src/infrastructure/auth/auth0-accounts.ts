// The IdentityAccounts port over Auth0's Management API (S16.5, architecture D38). A machine-to-
// machine application holding only the `delete:users` scope gets a token by client credentials and
// deletes the Auth0 user behind each identity: Auth0's user ID is the ID token's `sub`. Plain
// fetch, as two endpoints don't justify the SDK.
//
// The Management API lives on the tenant's own domain (`toe-beans.eu.auth0.com`), not the custom
// domain the issuer uses, so the domain is configured separately.
import type { Clock, IdentityAccounts, Logger } from '../../application/ports/index.js';

const TIMEOUT_MS = 10_000;
/** A token is used until this long before it expires. */
const EXPIRY_MARGIN_MS = 60_000;

export interface Auth0AccountsOptions {
	/** The tenant's domain, e.g. `toe-beans.eu.auth0.com`. */
	domain: string;
	clientId: string;
	clientSecret: string;
	/** `OIDC_ISSUER`: only identities this issuer issued are Auth0's to delete. */
	issuer: string;
	clock: Clock;
	fetch?: typeof globalThis.fetch;
}

export class IdentityAccountsError extends Error {
	override name = 'IdentityAccountsError';
}

const sameIssuer = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

export function auth0Accounts({
	domain,
	clientId,
	clientSecret,
	issuer,
	clock,
	fetch = globalThis.fetch
}: Auth0AccountsOptions): IdentityAccounts {
	const base = `https://${domain}`;
	// A disposable cache (NFR-08): a new instance just asks for another token.
	let token: { value: string; until: number } | null = null;

	async function accessToken(): Promise<string> {
		if (token && token.until > clock.now().getTime()) return token.value;
		const response = await fetch(`${base}/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				grant_type: 'client_credentials',
				client_id: clientId,
				client_secret: clientSecret,
				audience: `${base}/api/v2/`
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		// The status only, here and below: Auth0's error bodies aren't for the logs.
		if (!response.ok) {
			await response.body?.cancel();
			throw new IdentityAccountsError(`auth0 token request failed with ${response.status}`);
		}
		const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
		if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
			throw new IdentityAccountsError('auth0 token response has no token');
		}
		token = {
			value: body.access_token,
			until: clock.now().getTime() + body.expires_in * 1000 - EXPIRY_MARGIN_MS
		};
		return token.value;
	}

	return {
		async delete(identities) {
			const subjects = identities.filter((i) => sameIssuer(i.issuer, issuer)).map((i) => i.subject);
			if (subjects.length === 0) return;
			const bearer = await accessToken();
			for (const subject of subjects) {
				const response = await fetch(`${base}/api/v2/users/${encodeURIComponent(subject)}`, {
					method: 'DELETE',
					headers: { authorization: `Bearer ${bearer}` },
					signal: AbortSignal.timeout(TIMEOUT_MS)
				});
				await response.body?.cancel();
				if (response.status === 401) token = null;
				// 404: already gone, from an earlier try.
				if (!response.ok && response.status !== 404) {
					throw new IdentityAccountsError(`auth0 user delete failed with ${response.status}`);
				}
			}
		}
	};
}

/**
 * For the mock provider, which keeps no accounts, and any provider without a management client:
 * says so in the log, so a deployment that should delete them shows it doesn't.
 */
export function noIdentityAccounts(logger: Logger): IdentityAccounts {
	const log = logger.child({ component: 'identity-accounts' });
	return {
		async delete(identities) {
			if (identities.length > 0) {
				log.info('provider accounts left in place: no management client configured', {
					identities: identities.length
				});
			}
		}
	};
}
