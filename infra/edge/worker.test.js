import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markHeart, markLetters } from '../../apps/web/src/lib/assets/brand/mark.ts';
import worker from './worker.js';

const ORIGIN = 'https://toe-beans-1047834821273.africa-south1.run.app';

const { privateKey } = await crypto.subtle.generateKey(
	{
		name: 'RSASSA-PKCS1-v1_5',
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: 'SHA-256'
	},
	true,
	['sign']
);
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const ID_TOKEN = `h.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.s`;

// A new key ID per test, so each starts without the isolate's kept token.
let keys = 0;
/** @type {{ PROXY_SECRET: string, EDGE_KEY: string }} */
let env;
beforeEach(() => {
	env = { PROXY_SECRET: 's3cret', EDGE_KEY: JSON.stringify({ ...jwk, kid: `k${++keys}` }) };
});

/**
 * Stubs the Worker's fetches: Google's token exchange (refused with `google`'s status, if given)
 * and the origin, which gives one answer. Records the origin requests and counts the exchanges.
 */
function origin(/** @type {Response} */ answer, { google = 200 } = {}) {
	const seen = /** @type {{ url: string, headers: Headers }[]} */ ([]);
	const exchanges = { count: 0 };
	vi.stubGlobal(
		'fetch',
		vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
			if (!url.startsWith(ORIGIN)) {
				exchanges.count++;
				if (google !== 200) return new Response('{}', { status: google });
				return url.startsWith('https://sts.')
					? Response.json({ access_token: 'federated' })
					: Response.json({ token: ID_TOKEN });
			}
			seen.push({ url, headers: new Headers(init.headers) });
			return answer.clone();
		})
	);
	return Object.assign(seen, { exchanges });
}

const get = (/** @type {string} */ path, /** @type {Record<string, string>} */ headers = {}) =>
	worker.fetch(new Request(`https://toebeans.co.za${path}`, { headers }), env);

/** An answer from the app, which always names the request. */
const fromApp = (/** @type {number} */ status) =>
	new Response('app', { status, headers: { 'x-request-id': 'r1' } });

/** Cloud Run turning the request away before the app. */
const refused = (/** @type {number} */ status = 404) =>
	new Response('<html>Error: Page not found</html>', {
		status,
		headers: { 'content-type': 'text/html' }
	});

afterEach(() => vi.unstubAllGlobals());

describe('the edge Worker', () => {
	it('forwards to Cloud Run with the proxy secret, joining the path as text', async () => {
		const seen = origin(fromApp(200));
		const response = await get('//attacker.example/x?y=1', { 'x-toe-beans-proxy': 'forged' });
		expect(response.status).toBe(200);
		expect(seen[0].url).toBe(`${ORIGIN}//attacker.example/x?y=1`);
		expect(seen[0].headers.get('x-toe-beans-proxy')).toBe('s3cret');
	});

	describe("Google's invoker check (D45, security audit R1)", () => {
		it("sends the Worker's ID token, leaving the client's Authorization alone", async () => {
			const seen = origin(fromApp(200));
			await get('/internal/tick', {
				authorization: 'Bearer from-the-client',
				'x-serverless-authorization': 'Bearer forged'
			});
			expect(seen[0].headers.get('x-serverless-authorization')).toBe(`Bearer ${ID_TOKEN}`);
			expect(seen[0].headers.get('authorization')).toBe('Bearer from-the-client');
		});

		it('mints the token once for many requests', async () => {
			const seen = origin(fromApp(200));
			await Promise.all([get('/'), get('/today'), get('/api/v1/me')]);
			await get('/dogs');
			expect(seen.exchanges.count).toBe(2);
		});

		it("answers 502, not the paused page, when Google won't issue a token", async () => {
			const seen = origin(fromApp(200), { google: 403 });
			const response = await get('/', { accept: 'text/html' });
			expect(response.status).toBe(502);
			expect(response.headers.get('x-toe-beans-maintenance')).toBeNull();
			expect(seen).toHaveLength(0);
		});

		it('answers 502 when Cloud Run rejects the token, and mints a new one next time', async () => {
			const seen = origin(refused(401));
			const response = await get('/', { accept: 'text/html' });
			expect(response.status).toBe(502);
			expect(response.headers.get('x-toe-beans-maintenance')).toBeNull();
			await get('/');
			expect(seen.exchanges.count).toBe(4);
		});

		it('refuses to run without its key', async () => {
			origin(fromApp(200));
			const response = await worker.fetch(new Request('https://toebeans.co.za/'), {
				PROXY_SECRET: 's3cret',
				EDGE_KEY: ''
			});
			expect(response.status).toBe(500);
		});
	});

	it("passes the app's own 404s and 403s through", async () => {
		origin(fromApp(404));
		expect(await (await get('/nope', { accept: 'text/html' })).text()).toBe('app');
		origin(fromApp(403));
		expect((await get('/api/v1/me')).status).toBe(403);
	});

	describe('while the spending cap holds (D45)', () => {
		it.each([404, 403])('shows the maintenance page when Cloud Run refuses with %i', async (s) => {
			origin(refused(s));
			const response = await get('/', { accept: 'text/html,application/xhtml+xml' });
			expect(response.status).toBe(503);
			expect(response.headers.get('x-toe-beans-maintenance')).toBe('1');
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(response.headers.get('content-type')).toMatch(/^text\/html/);
			expect(await response.text()).toContain('Toe Beans is paused');
		});

		it("draws the app's mark and loads the app's fonts from the Worker's own files", async () => {
			origin(refused(403));
			const response = await get('/', { accept: 'text/html' });
			const html = await response.text();
			expect(html).toContain(`fill-rule="evenodd" d="${markLetters}"`);
			expect(html).toContain(`d="${markHeart}"`);
			expect(html.match(/<ellipse /g)).toHaveLength(4);
			expect(response.headers.get('content-security-policy')).toContain("font-src 'self'");
			const fonts = [...html.matchAll(/url\(\/(edge-fonts\/[^)]+)\)/g)].map((m) => m[1]);
			expect(fonts).toEqual(['edge-fonts/nunito-latin.woff2', 'edge-fonts/fredoka-latin.woff2']);
		});

		it.each([
			['nunito-latin.woff2', 'nunito/files/nunito-latin-wght-normal.woff2'],
			['fredoka-latin.woff2', 'fredoka/files/fredoka-latin-wght-normal.woff2']
		])("serves %s as the app's own copy of the font", (file, source) => {
			const ours = readFileSync(new URL(`assets/edge-fonts/${file}`, import.meta.url));
			const app = readFileSync(
				new URL(`../../apps/web/node_modules/@fontsource-variable/${source}`, import.meta.url)
			);
			expect(ours.equals(app), `copy ${source} over ${file}`).toBe(true);
		});

		it('answers API calls in plain text, which the app reads as unreachable', async () => {
			origin(refused());
			const response = await get('/api/v1/dogs', { accept: 'application/json' });
			expect(response.status).toBe(503);
			expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
		});

		it('leaves a missing build file as it is', async () => {
			origin(refused());
			expect((await get('/_app/immutable/old.js')).status).toBe(404);
		});
	});

	it('sends www to the apex', async () => {
		const response = await worker.fetch(new Request('https://www.toebeans.co.za/a?b=1'), env);
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('https://toebeans.co.za/a?b=1');
	});
});
