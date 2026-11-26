// The Worker's Google identity (architecture §8.4, D45; security audit R1). Cloud Run lets in only
// its invokers: this Worker, as the service account toe-beans-edge, and the tick. Anyone else is
// turned away by Google before the app, its logs or the database see anything.
//
// The project refuses service account keys (org policy), and a Worker has no identity Google
// knows, so it gets one through Workload Identity Federation instead:
//
//   1. it signs a short JWT with its own private key (EDGE_KEY, a Worker secret, made by
//      edge-key.mjs; Google holds only the public half, in the pool's provider)
//   2. Google's STS swaps the JWT for a federated access token
//   3. the IAM Credentials API, with that token, issues an ID token for toe-beans-edge whose
//      audience is the Cloud Run URL
//
// The ID token lasts an hour. Each isolate keeps it in memory and gets a new one five minutes
// before it runs out. Only the token is shared between requests, never an exchange in flight: a
// promise belongs to the request that made it, and when that request ends early (the phone closed
// the app, the client timed out) the Workers runtime drops it, so it never settles. A shared one
// left every later request on the isolate failing until Cloudflare retired it, which was prod's
// intermittent 502s of 26 Nov 2026. Requests that start together on a fresh isolate each mint, at
// worst a few extra calls to Google. Nothing here is logged; the Worker logs a failure's step and
// status (worker.js).

const STS = 'https://sts.googleapis.com/v1/token';
const CREDENTIALS = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts';
/** A token with less than this left is replaced before use. */
const MARGIN_MS = 5 * 60_000;
/** The JWT the Worker signs only has to last until STS has seen it. */
const ASSERTION_SECONDS = 5 * 60;

/**
 * @typedef {object} EdgeIdentity
 * @property {string} issuer          the provider's issuer URI; the JWT's `iss`
 * @property {string} subject         the JWT's `sub`, which the provider's condition pins
 * @property {string} provider        `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<id>`
 * @property {string} serviceAccount  the account the ID token is for
 * @property {string} audience        the Cloud Run URL the ID token is for
 */

/**
 * @typedef {JsonWebKey & { kid: string }} SigningKey
 */

const encoder = new TextEncoder();

/** @param {ArrayBuffer | Uint8Array} bytes */
const base64url = (bytes) =>
	btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');

/** @param {unknown} value */
const encodeJson = (value) => base64url(encoder.encode(JSON.stringify(value)));

/** The `exp` of a JWT, in ms, or null if it can't be read. Not verified: Google just issued it. */
function expiry(/** @type {string} */ jwt) {
	try {
		const payload = jwt.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
		const exp = JSON.parse(atob(payload)).exp;
		return typeof exp === 'number' ? exp * 1000 : null;
	} catch {
		return null;
	}
}

/**
 * The JWT the provider checks: signed RS256 with the Worker's key, for the provider's audience.
 * @param {EdgeIdentity} identity
 * @param {SigningKey} key
 * @param {number} nowMs
 */
export async function assertion(identity, key, nowMs) {
	const { kid, ...jwk } = key;
	const signing = await crypto.subtle.importKey(
		'jwk',
		jwk,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
	const iat = Math.floor(nowMs / 1000);
	const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT', kid })}.${encodeJson({
		iss: identity.issuer,
		sub: identity.subject,
		aud: `https://iam.googleapis.com/${identity.provider}`,
		iat,
		exp: iat + ASSERTION_SECONDS
	})}`;
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		signing,
		encoder.encode(unsigned)
	);
	return `${unsigned}.${base64url(signature)}`;
}

/** Google's answer wasn't a 2xx. The message names the step and status; bodies aren't kept. */
export class TokenError extends Error {}

/**
 * ID tokens for the Cloud Run URL, minted as needed and kept until shortly before they expire.
 * @param {{ identity: EdgeIdentity, key: SigningKey, fetch: typeof fetch, now?: () => number }} deps
 */
export function idTokens({ identity, key, fetch, now = Date.now }) {
	/** @type {{ token: string, expiresAt: number } | null} */
	let cached = null;
	/** @param {string} step @param {string} url @param {RequestInit} init */
	const post = async (step, url, init) => {
		const response = await fetch(url, { method: 'POST', ...init });
		if (!response.ok) {
			// Google's error code and description name the cause (invalid_grant, a clock or quota
			// problem) and hold nothing secret; the rest of the body isn't kept.
			const body = await response.json().catch(() => null);
			const why = [
				body?.error?.status ?? body?.error,
				body?.error?.message ?? body?.error_description
			]
				.filter((part) => typeof part === 'string')
				.join(': ')
				.slice(0, 300);
			throw new TokenError(`${step} answered ${response.status}${why ? ` (${why})` : ''}`);
		}
		return response.json();
	};

	async function mint() {
		const subjectToken = await assertion(identity, key, now());
		const { access_token: federated } = await post('STS', STS, {
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
				audience: `//iam.googleapis.com/${identity.provider}`,
				scope: 'https://www.googleapis.com/auth/cloud-platform',
				requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
				subjectToken,
				subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt'
			})
		});
		const { token } = await post(
			'generateIdToken',
			`${CREDENTIALS}/${identity.serviceAccount}:generateIdToken`,
			{
				headers: { 'content-type': 'application/json', authorization: `Bearer ${federated}` },
				body: JSON.stringify({ audience: identity.audience, includeEmail: true })
			}
		);
		if (typeof token !== 'string') throw new TokenError('generateIdToken returned no token');
		// Google's ID tokens last an hour; if the expiry can't be read, assume less.
		cached = { token, expiresAt: expiry(token) ?? now() + 30 * 60_000 };
		return token;
	}

	return {
		/** A token with at least five minutes left. Throws TokenError if Google refuses. */
		async get() {
			if (cached && cached.expiresAt - now() > MARGIN_MS) return cached.token;
			// Never shared: see the top of this file.
			return mint();
		},
		/** Drops the kept token, after Cloud Run refused it. */
		forget() {
			cached = null;
		}
	};
}
