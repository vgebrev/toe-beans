// The IdentityProvider port over openid-client (architecture §3.4, D5): a confidential client using
// Authorization Code + PKCE. openid-client validates the ID token (signature via JWKS, iss, aud,
// exp, nonce) and the state.
import * as oidc from 'openid-client';
import type { IdentityProvider } from '../../application/ports/index.js';
import { err, ok } from '../../domain/result.js';

export interface OidcOptions {
	issuer: string;
	clientId: string;
	clientSecret: string;
}

export function oidcIdentityProvider({
	issuer,
	clientId,
	clientSecret
}: OidcOptions): IdentityProvider {
	let configuration: Promise<oidc.Configuration> | undefined;

	// Discovery happens at the first sign-in, not at startup: no cold-start cost, and the app
	// starts while the provider is down. A failed discovery is retried next time.
	const config = () => {
		configuration ??= oidc
			.discovery(new URL(issuer), clientId, undefined, oidc.ClientSecretBasic(clientSecret), {
				// Only the local mock provider is served over http; config refuses it in prod.
				...(issuer.startsWith('http:') && { execute: [oidc.allowInsecureRequests] })
			})
			.catch((e: unknown) => {
				configuration = undefined;
				throw e;
			});
		return configuration;
	};

	return {
		async beginSignIn({ redirectUri, prompt }) {
			const checks = {
				state: oidc.randomState(),
				nonce: oidc.randomNonce(),
				codeVerifier: oidc.randomPKCECodeVerifier()
			};
			const url = oidc.buildAuthorizationUrl(await config(), {
				redirect_uri: redirectUri,
				scope: 'openid email profile',
				state: checks.state,
				nonce: checks.nonce,
				code_challenge: await oidc.calculatePKCECodeChallenge(checks.codeVerifier),
				code_challenge_method: 'S256',
				...(prompt && { prompt })
			});
			return { url: url.href, checks };
		},

		async completeSignIn(callbackUrl, checks) {
			try {
				const tokens = await oidc.authorizationCodeGrant(await config(), callbackUrl, {
					expectedState: checks.state,
					expectedNonce: checks.nonce,
					pkceCodeVerifier: checks.codeVerifier,
					idTokenExpected: true
				});
				const claims = tokens.claims()!;
				return ok({
					issuer: claims.iss,
					subject: claims.sub,
					...(typeof claims.email === 'string' && { email: claims.email }),
					emailVerified: claims.email_verified === true,
					...(typeof claims.name === 'string' && { name: claims.name }),
					...(typeof claims.picture === 'string' && { picture: claims.picture })
				});
			} catch (e) {
				if (e instanceof oidc.AuthorizationResponseError && e.error === 'access_denied') {
					return err({ kind: 'denied' });
				}
				return err({ kind: 'failed', reason: describe(e) });
			}
		},

		async signOutUrl(postSignOutUri) {
			return oidc.buildEndSessionUrl(await config(), {
				client_id: clientId,
				post_logout_redirect_uri: postSignOutUri
			}).href;
		}
	};
}

/**
 * A loggable reason: the error's class and code, never its message's echo of the response or of
 * any token values.
 */
function describe(e: unknown): string {
	if (e instanceof oidc.AuthorizationResponseError) return `authorization error: ${e.error}`;
	if (e instanceof oidc.ResponseBodyError) return `token endpoint error: ${e.error}`;
	if (e instanceof Error) {
		const code = (e as { code?: unknown }).code;
		return typeof code === 'string' ? `${e.name}: ${code}` : e.name;
	}
	return 'unknown';
}
