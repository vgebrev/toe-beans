import { describe, expect, it } from 'vitest';
import { manualClock } from '../../testing/clock.js';
import { auth0Accounts } from './auth0-accounts.js';

const ISSUER = 'https://auth.toebeans.co.za/';
const linkedAt = new Date('2026-11-01T00:00:00Z');
const google = { issuer: ISSUER, subject: 'google-oauth2|123', linkedAt };
const email = { issuer: 'https://auth.toebeans.co.za', subject: 'auth0|abc', linkedAt };
const elsewhere = { issuer: 'http://localhost:8090/default', subject: 'sam', linkedAt };

function fakeAuth0(statuses: { token?: number; delete?: number } = {}) {
	const calls: { method: string; url: string; authorization?: string | null; body?: unknown }[] =
		[];
	const fetch: typeof globalThis.fetch = async (input, init) => {
		const url = String(input);
		const headers = new Headers(init?.headers);
		calls.push({
			method: init?.method ?? 'GET',
			url,
			authorization: headers.get('authorization'),
			...(init?.body && { body: JSON.parse(String(init.body)) })
		});
		if (url.endsWith('/oauth/token')) {
			return Response.json(
				{ access_token: `token-${calls.length}`, expires_in: 86_400, token_type: 'Bearer' },
				{ status: statuses.token ?? 200 }
			);
		}
		return new Response(null, { status: statuses.delete ?? 204 });
	};
	return { fetch, calls };
}

const options = (fetch: typeof globalThis.fetch, clock = manualClock()) => ({
	domain: 'toe-beans.eu.auth0.com',
	clientId: 'm2m-client',
	clientSecret: 'm2m-secret',
	issuer: ISSUER,
	clock,
	fetch
});

describe('auth0Accounts', () => {
	it("deletes the issuer's users with a client-credentials token for the tenant's API", async () => {
		const { fetch, calls } = fakeAuth0();
		await auth0Accounts(options(fetch)).delete([google, email, elsewhere]);
		expect(calls).toEqual([
			{
				method: 'POST',
				url: 'https://toe-beans.eu.auth0.com/oauth/token',
				authorization: null,
				body: {
					grant_type: 'client_credentials',
					client_id: 'm2m-client',
					client_secret: 'm2m-secret',
					audience: 'https://toe-beans.eu.auth0.com/api/v2/'
				}
			},
			{
				method: 'DELETE',
				url: 'https://toe-beans.eu.auth0.com/api/v2/users/google-oauth2%7C123',
				authorization: 'Bearer token-1'
			},
			{
				method: 'DELETE',
				url: 'https://toe-beans.eu.auth0.com/api/v2/users/auth0%7Cabc',
				authorization: 'Bearer token-1'
			}
		]);
	});

	it('asks for nothing when no identity is Auth0’s', async () => {
		const { fetch, calls } = fakeAuth0();
		await auth0Accounts(options(fetch)).delete([elsewhere]);
		expect(calls).toEqual([]);
	});

	it('keeps the token until shortly before it expires', async () => {
		const { fetch, calls } = fakeAuth0();
		const clock = manualClock();
		const accounts = auth0Accounts(options(fetch, clock));
		await accounts.delete([google]);
		clock.advance(23 * 60 * 60 * 1000);
		await accounts.delete([google]);
		expect(calls.filter((c) => c.url.endsWith('/oauth/token'))).toHaveLength(1);
		clock.advance(60 * 60 * 1000);
		await accounts.delete([google]);
		expect(calls.filter((c) => c.url.endsWith('/oauth/token'))).toHaveLength(2);
	});

	it('takes a user already gone as deleted, so a retry finishes', async () => {
		const { fetch } = fakeAuth0({ delete: 404 });
		await expect(auth0Accounts(options(fetch)).delete([google])).resolves.toBeUndefined();
	});

	it('throws on a refusal, naming only the status', async () => {
		await expect(
			auth0Accounts(options(fakeAuth0({ delete: 403 }).fetch)).delete([google])
		).rejects.toThrow(/^auth0 user delete failed with 403$/);
		await expect(
			auth0Accounts(options(fakeAuth0({ token: 401 }).fetch)).delete([google])
		).rejects.toThrow(/^auth0 token request failed with 401$/);
	});
});
