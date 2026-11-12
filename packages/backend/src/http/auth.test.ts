import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Auth } from '../application/auth/auth.js';
import type { RateLimiter } from '../application/ports/index.js';
import { err, ok } from '../domain/result.js';
import { cookieSettings, createAuthHttp, safeReturnTo, signInPath } from './auth.js';
import { serializeCookie } from './response.js';

const TOKEN = 'T'.repeat(43);
const HANDLE = 'H'.repeat(43);
const viewer = {
	auth: { userId: 'u' as never },
	displayName: 'Sam',
	email: 'sam@example.com',
	member: null
};

function fakeAuth(overrides: Partial<Auth> = {}): Auth {
	return {
		startSignIn: vi.fn(async () => ({ url: 'https://idp.example/authorize', handle: HANDLE })),
		finishSignIn: vi.fn(async () =>
			ok({ token: TOKEN, expiresAt: new Date(Date.now() + 3600_000), returnTo: '/plan' })
		),
		authenticate: vi.fn(async () => ({ viewer })),
		signOut: vi.fn(async () => ({ url: 'https://idp.example/logout' })),
		...overrides
	};
}

const allowAll: RateLimiter = { take: () => ({ allowed: true }) };
const silent = { debug() {}, info() {}, warn: vi.fn(), error() {}, child: () => silent };
const options = (publicOrigin: string, rateLimit = allowAll) => ({
	publicOrigin,
	rateLimit,
	logger: silent
});
const client = { clientAddress: '203.0.113.7' };

const reader =
	(cookies: Record<string, string>) =>
	(name: string): string | undefined =>
		cookies[name];

describe('safeReturnTo', () => {
	it.each([
		['/plan', '/plan'],
		['/plan?dog=1#today', '/plan?dog=1#today'],
		['/join/abc', '/join/abc']
	])('keeps the path %s', (input, expected) => expect(safeReturnTo(input)).toBe(expected));

	it.each([
		null,
		'',
		'plan',
		'https://evil.example/',
		'//evil.example/',
		'/\\evil.example/',
		'/\t/evil.example',
		'/\n/evil.example',
		'/sign-in',
		'/auth/callback?code=x',
		'/' + 'a'.repeat(2000)
	])('replaces %j with /', (input) => expect(safeReturnTo(input)).toBe('/'));
});

describe('signInPath', () => {
	it('leaves out the defaults', () => {
		expect(signInPath('/')).toBe('/sign-in');
		expect(signInPath('/plan?x=1', 'unverified')).toBe(
			'/sign-in?error=unverified&returnTo=%2Fplan%3Fx%3D1'
		);
	});
});

describe('cookies', () => {
	it('are __Host- and Secure on https, plain on an http origin', () => {
		expect(cookieSettings('https://toebeans.co.za')).toEqual({
			secure: true,
			session: '__Host-tb_session',
			signIn: '__Host-tb_signin'
		});
		expect(cookieSettings('http://192.168.1.20:7877')).toEqual({
			secure: false,
			session: 'tb_session',
			signIn: 'tb_signin'
		});
	});

	it('serialise as HttpOnly, Path=/ cookies', () => {
		expect(
			serializeCookie({
				name: '__Host-tb_session',
				value: TOKEN,
				maxAge: 60,
				secure: true,
				sameSite: 'lax'
			})
		).toBe(`__Host-tb_session=${TOKEN}; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax`);
	});
});

describe('auth http', () => {
	const origin = 'https://toebeans.co.za';

	it('sign-in redirects to the provider with a 10-minute sign-in cookie', async () => {
		const auth = fakeAuth();
		const res = await createAuthHttp(auth, options(origin)).signIn({
			returnTo: '//evil.example',
			prompt: 'login',
			...client
		});
		expect(auth.startSignIn).toHaveBeenCalledWith({ returnTo: '/', prompt: 'login' });
		expect(res).toMatchObject({
			status: 303,
			headers: { location: 'https://idp.example/authorize' },
			cookies: [{ name: '__Host-tb_signin', value: HANDLE, maxAge: 600, secure: true }]
		});
	});

	it('ignores any prompt but login', async () => {
		const auth = fakeAuth();
		await createAuthHttp(auth, options(origin)).signIn({
			returnTo: '/',
			prompt: 'none',
			...client
		});
		expect(auth.startSignIn).toHaveBeenCalledWith({ returnTo: '/' });
	});

	it('the callback validates against the public origin and sets the session cookie', async () => {
		// Frozen, so a millisecond between the fake's expiry and the cookie's can't make it 3599.
		vi.useFakeTimers({ toFake: ['Date'] });
		onTestFinished(() => void vi.useRealTimers());
		const auth = fakeAuth();
		const res = await createAuthHttp(auth, options(origin)).callback({
			search: '?code=c&state=s',
			cookie: reader({ '__Host-tb_signin': HANDLE, '__Host-tb_session': 'old' }),
			...client
		});
		expect(auth.finishSignIn).toHaveBeenCalledWith({
			callbackUrl: new URL('https://toebeans.co.za/auth/callback?code=c&state=s'),
			handle: HANDLE,
			previousToken: 'old'
		});
		expect(res.headers.location).toBe('/plan');
		expect(res.cookies).toEqual([
			expect.objectContaining({ name: '__Host-tb_signin', maxAge: 0 }),
			expect.objectContaining({ name: '__Host-tb_session', value: TOKEN, maxAge: 3600 })
		]);
	});

	it.each([
		['failed', '/sign-in?error=failed&returnTo=%2Fcare'],
		['email-unverified', '/sign-in?error=unverified&returnTo=%2Fcare']
	] as const)('a %s callback goes back to sign-in with the reason', async (kind, location) => {
		const auth = fakeAuth({ finishSignIn: async () => err({ kind, returnTo: '/care' }) });
		const res = await createAuthHttp(auth, options(origin)).callback({
			search: '?error=x',
			cookie: reader({}),
			...client
		});
		expect(res.headers.location).toBe(location);
		expect(res.cookies).toEqual([expect.objectContaining({ name: '__Host-tb_signin', maxAge: 0 })]);
	});

	describe('rate limit', () => {
		const refuseAll: RateLimiter = { take: () => ({ allowed: false, retryAfterSeconds: 90 }) };

		it('keys sign-in and callback on the client address', async () => {
			const take = vi.fn(() => ({ allowed: true as const }));
			const http = createAuthHttp(fakeAuth(), options(origin, { take }));
			await http.signIn({ returnTo: '/', prompt: null, ...client });
			await http.callback({ search: '', cookie: reader({}), ...client });
			expect(take.mock.calls).toEqual([['203.0.113.7'], ['203.0.113.7']]);
		});

		it('over the limit, sign-in goes back to the sign-in page without starting', async () => {
			const auth = fakeAuth();
			const res = await createAuthHttp(auth, options(origin, refuseAll)).signIn({
				returnTo: '/care',
				prompt: null,
				...client
			});
			expect(auth.startSignIn).not.toHaveBeenCalled();
			expect(res).toMatchObject({
				status: 303,
				headers: { location: '/sign-in?error=too-many&returnTo=%2Fcare' }
			});
			expect(silent.warn).toHaveBeenCalledWith('sign-in rate limited', {
				step: 'sign-in',
				retryAfterSeconds: 90
			});
		});

		it('over the limit, the callback leaves the pending sign-in alone', async () => {
			const auth = fakeAuth();
			const res = await createAuthHttp(auth, options(origin, refuseAll)).callback({
				search: '?code=c&state=s',
				cookie: reader({ '__Host-tb_signin': HANDLE }),
				...client
			});
			expect(auth.finishSignIn).not.toHaveBeenCalled();
			expect(res.headers.location).toBe('/sign-in?error=too-many');
			expect(res.cookies).toEqual([
				expect.objectContaining({ name: '__Host-tb_signin', maxAge: 0 })
			]);
		});
	});

	it('sign-out clears the session cookie and goes to the provider', async () => {
		const auth = fakeAuth();
		const res = await createAuthHttp(auth, options(origin)).signOut({
			cookie: reader({ '__Host-tb_session': TOKEN })
		});
		expect(auth.signOut).toHaveBeenCalledWith(TOKEN);
		expect(res).toMatchObject({
			status: 303,
			headers: { location: 'https://idp.example/logout' },
			cookies: [{ name: '__Host-tb_session', value: '', maxAge: 0 }]
		});
	});

	describe('authenticate', () => {
		it('is signed out without a cookie, without asking the backend', async () => {
			const auth = fakeAuth();
			const http = createAuthHttp(auth, options(origin));
			expect(await http.authenticate(reader({}))).toEqual({ viewer: null, cookies: [] });
			expect(auth.authenticate).not.toHaveBeenCalled();
		});

		it('clears a cookie whose session is gone', async () => {
			const http = createAuthHttp(fakeAuth({ authenticate: async () => null }), options(origin));
			expect(await http.authenticate(reader({ '__Host-tb_session': TOKEN }))).toEqual({
				viewer: null,
				cookies: [expect.objectContaining({ name: '__Host-tb_session', maxAge: 0 })]
			});
		});

		it('renews the cookie when the session slid forward', async () => {
			const renewedUntil = new Date(Date.now() + 90 * 86_400_000);
			const http = createAuthHttp(
				fakeAuth({ authenticate: async () => ({ viewer, renewedUntil }) }),
				options(origin)
			);
			const { cookies } = await http.authenticate(reader({ '__Host-tb_session': TOKEN }));
			expect(cookies).toEqual([
				expect.objectContaining({ name: '__Host-tb_session', value: TOKEN })
			]);
			expect(cookies[0]!.maxAge).toBeGreaterThan(90 * 86_400 - 5);
		});
	});

	describe('checkOrigin', () => {
		const check = createAuthHttp(fakeAuth(), options(origin)).checkOrigin;

		it('lets reads through from anywhere', () => {
			expect(check({ method: 'GET', origin: 'https://evil.example', fetchSite: null })).toBeNull();
		});

		it('lets same-origin writes through', () => {
			expect(check({ method: 'POST', origin, fetchSite: 'same-origin' })).toBeNull();
			expect(check({ method: 'DELETE', origin: null, fetchSite: 'same-origin' })).toBeNull();
		});

		it.each([
			{ origin: 'https://evil.example', fetchSite: 'cross-site' },
			{ origin: 'https://toebeans.co.za.evil.example', fetchSite: null },
			{ origin: null, fetchSite: null },
			{ origin: 'null', fetchSite: 'cross-site' }
		])('refuses a write from %j', (headers) => {
			expect(check({ method: 'POST', ...headers })).toMatchObject({
				status: 403,
				body: { type: 'toe-beans/forbidden' }
			});
		});
	});
});
