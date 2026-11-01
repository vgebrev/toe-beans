import type { Result } from '../../domain/result.js';

/** Values that must come back unchanged at the callback: kept server-side between the two. */
export interface SignInChecks {
	state: string;
	nonce: string;
	codeVerifier: string;
}

/** What a validated ID token says about the person (architecture §3.4). */
export interface IdentityClaims {
	issuer: string;
	subject: string;
	email?: string;
	emailVerified: boolean;
	name?: string;
	picture?: string;
}

export type IdentityFailure =
	/** The person cancelled or the provider refused them. */
	| { kind: 'denied' }
	/** Anything else: a bad state, a token that fails validation, the provider unreachable. */
	| { kind: 'failed'; reason: string };

/**
 * An OpenID Connect provider, used as a confidential client with Authorization Code + PKCE
 * (architecture §3.4, D5). The adapter does all token validation.
 */
export interface IdentityProvider {
	/** Where to send the browser, and the checks to keep until it comes back. */
	beginSignIn(options: {
		redirectUri: string;
		/** `login` makes the provider ask again even if it remembers the person. */
		prompt?: 'login';
	}): Promise<{ url: string; checks: SignInChecks }>;
	/**
	 * Exchanges the code in `callbackUrl` and validates the ID token against `checks`. The URL must
	 * be built from the public origin, since it is also the `redirect_uri` sent to the provider.
	 */
	completeSignIn(
		callbackUrl: URL,
		checks: SignInChecks
	): Promise<Result<IdentityClaims, IdentityFailure>>;
	/** The provider's end-session URL, so the next sign-in can pick another account. */
	signOutUrl(postSignOutUri: string): Promise<string>;
}
