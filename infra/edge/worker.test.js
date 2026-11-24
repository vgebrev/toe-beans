import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

const ORIGIN = 'https://toe-beans-1047834821273.africa-south1.run.app';
const env = { PROXY_SECRET: 's3cret' };

/** Stubs the Worker's fetch of the origin with one answer, and records what it asked for. */
function origin(/** @type {Response} */ answer) {
	const seen = /** @type {{ url: string, headers: Headers }[]} */ ([]);
	vi.stubGlobal(
		'fetch',
		vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
			seen.push({ url, headers: new Headers(init.headers) });
			return answer;
		})
	);
	return seen;
}

const get = (/** @type {string} */ path, /** @type {Record<string, string>} */ headers = {}) =>
	worker.fetch(new Request(`https://toebeans.co.za${path}`, { headers }), env);

/** An answer from the app, which always names the request. */
const fromApp = (/** @type {number} */ status) =>
	new Response('app', { status, headers: { 'x-request-id': 'r1' } });

/** Cloud Run turning the request away at its ingress, before the app. */
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
