import { describe, expect, it, vi } from 'vitest';
import { assertion, idTokens, TokenError } from './google-identity.js';

const identity = {
	issuer: 'https://toebeans.co.za',
	subject: 'toe-beans-edge',
	provider: 'projects/1/locations/global/workloadIdentityPools/cloudflare/providers/toe-beans-edge',
	serviceAccount: 'toe-beans-edge@p.iam.gserviceaccount.com',
	audience: 'https://toe-beans-1.africa-south1.run.app'
};

const pair = await crypto.subtle.generateKey(
	{
		name: 'RSASSA-PKCS1-v1_5',
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: 'SHA-256'
	},
	true,
	['sign', 'verify']
);
const key = { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid: 'k1' };

const decode = (/** @type {string} */ part) =>
	JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** An ID token as far as the Worker reads one: its `exp`. */
const idToken = (/** @type {number} */ expMs) =>
	`h.${Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000) })).toString('base64url')}.s`;

const T0 = Date.UTC(2026, 10, 24, 12);

/** Google's STS and IAM Credentials, issuing an hour-long token per exchange. */
function google({ fail = '', clock = () => T0 } = {}) {
	const calls = /** @type {{ url: string, headers: Headers, body: any }[]} */ ([]);
	const fetch = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
		calls.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
		if (fail && url.includes(fail)) return new Response('{"error":"denied"}', { status: 403 });
		if (url === 'https://sts.googleapis.com/v1/token') {
			return Response.json({ access_token: 'federated', token_type: 'Bearer' });
		}
		return Response.json({ token: idToken(clock() + 3600_000) });
	});
	return { fetch: /** @type {typeof globalThis.fetch} */ (fetch), calls };
}

describe('the assertion', () => {
	it("is an RS256 JWT for the provider, signed with the Worker's key", async () => {
		const jwt = await assertion(identity, key, T0);
		const [header, payload, signature] = jwt.split('.');
		expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'k1' });
		expect(decode(payload)).toEqual({
			iss: 'https://toebeans.co.za',
			sub: 'toe-beans-edge',
			aud: `https://iam.googleapis.com/${identity.provider}`,
			iat: T0 / 1000,
			exp: T0 / 1000 + 300
		});
		const valid = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			pair.publicKey,
			Buffer.from(signature, 'base64url'),
			new TextEncoder().encode(`${header}.${payload}`)
		);
		expect(valid).toBe(true);
	});
});

describe('ID tokens', () => {
	it('swaps the assertion at STS, then asks for an ID token for the Cloud Run URL', async () => {
		const api = google();
		const token = await idTokens({ identity, key, fetch: api.fetch, now: () => T0 }).get();
		expect(token).toBe(idToken(T0 + 3600_000));
		const [sts, credentials] = api.calls;
		expect(sts.url).toBe('https://sts.googleapis.com/v1/token');
		expect(sts.body).toMatchObject({
			grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
			audience: `//iam.googleapis.com/${identity.provider}`,
			subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt'
		});
		expect(decode(sts.body.subjectToken.split('.')[1]).sub).toBe('toe-beans-edge');
		expect(credentials.url).toBe(
			'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/toe-beans-edge@p.iam.gserviceaccount.com:generateIdToken'
		);
		expect(credentials.headers.get('authorization')).toBe('Bearer federated');
		expect(credentials.body).toEqual({ audience: identity.audience, includeEmail: true });
	});

	it('keeps a token until five minutes before it expires', async () => {
		let now = T0;
		const api = google({ clock: () => now });
		const tokens = idTokens({ identity, key, fetch: api.fetch, now: () => now });
		const first = await tokens.get();
		now = T0 + 54 * 60_000;
		expect(await tokens.get()).toBe(first);
		expect(api.calls).toHaveLength(2);
		now = T0 + 56 * 60_000;
		expect(await tokens.get()).not.toBe(first);
		expect(api.calls).toHaveLength(4);
	});

	it('makes one exchange for requests that arrive together', async () => {
		const api = google();
		const tokens = idTokens({ identity, key, fetch: api.fetch, now: () => T0 });
		const all = await Promise.all([tokens.get(), tokens.get(), tokens.get()]);
		expect(new Set(all).size).toBe(1);
		expect(api.calls).toHaveLength(2);
	});

	it('gets a new token once told the last one was refused', async () => {
		const api = google();
		const tokens = idTokens({ identity, key, fetch: api.fetch, now: () => T0 });
		await tokens.get();
		tokens.forget();
		await tokens.get();
		expect(api.calls).toHaveLength(4);
	});

	it.each([
		['STS', 'sts.googleapis.com', 1],
		['generateIdToken', 'generateIdToken', 2]
	])('throws when %s refuses, without the body, and tries again next time', async (step, at, n) => {
		const api = google({ fail: at });
		const tokens = idTokens({ identity, key, fetch: api.fetch, now: () => T0 });
		const failure = tokens.get();
		await expect(failure).rejects.toThrow(TokenError);
		await expect(failure).rejects.toThrow(`${step} answered 403`);
		await expect(tokens.get()).rejects.toThrow(TokenError);
		expect(api.calls).toHaveLength(2 * n);
	});
});
