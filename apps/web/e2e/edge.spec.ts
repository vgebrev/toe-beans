// Scanners' probes get a plain 404 rather than the app shell, and security.txt says where to report
// a problem (backlog S17.3). Pages stay out of shared caches (security audit R8). The login page's
// font comes from us, not Google Fonts (S19.2). Only the terms and privacy policy may be indexed
// (S21.3).
import { expect, test } from '@playwright/test';
import { MOCK_PROVIDER } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });

test('a probe from a script gets a short plain 404, not the app shell', async ({ request }) => {
	for (const path of [
		'/.env',
		'/.git/config',
		'/wp-login.php',
		'/actuator/health',
		'/v2/_catalog'
	]) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(404);
		expect(response.headers()['content-type'], path).toBe('text/plain; charset=utf-8');
		expect(response.headers()['cache-control'], path).toBe('no-store');
		expect(await response.text(), path).toBe('Not found\n');
	}
});

test('an unknown API path still asks for sign-in first', async ({ request }) => {
	expect((await request.get('/api/v1/nothing-here')).status()).toBe(401);
});

test("a person who opens a mistyped address sees the app's own page", async ({ page }) => {
	const response = await page.goto('/no-such-page');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that");
});

test('a page at a path that looks like a file is kept out of shared caches', async ({
	request
}) => {
	// Cloudflare caches by extension when the origin is silent (security audit R8): the app's own
	// 404 page at /x.png, and the sign-in redirect from a page there, must say private.
	for (const [path, status] of [
		['/no-such-page.png', 404],
		['/dogs/x.css', 303]
	] as const) {
		const response = await request.get(path, {
			headers: { 'sec-fetch-dest': 'document' },
			maxRedirects: 0
		});
		expect(response.status(), path).toBe(status);
		expect(response.headers()['cache-control'], path).toBe('private, no-cache');
	}
});

test('security.txt gives the contact and an expiry within a year', async ({ request }) => {
	const response = await request.get('/.well-known/security.txt');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');
	const text = await response.text();
	expect(text).toContain('Contact: mailto:support@toebeans.co.za\n');
	const expires = Date.parse(/^Expires: (.+)$/m.exec(text)?.[1] ?? '');
	expect(expires).toBeGreaterThan(Date.now());
	expect(expires).toBeLessThanOrEqual(Date.now() + 366 * 24 * 60 * 60 * 1000);
});

test.describe("the identity provider's login page", () => {
	// The proxy's header goes on at the network layer instead, as the Worker adds it beyond the
	// browser: sent from the page, a custom header makes the font load a preflighted request.
	test.use({ extraHTTPHeaders: {} });

	test('can load Nunito from us, and no other site can', async ({ page, baseURL }) => {
		const proxy = test.info().project.use.extraHTTPHeaders ?? {};
		const font = new URL('/fonts/nunito-latin.woff2', baseURL).href;
		await page.route(font, (route) =>
			route.continue({ headers: { ...route.request().headers(), ...proxy } })
		);
		const load = (url: string) =>
			page.evaluate(async (url) => {
				try {
					await new FontFace('Sign-in Nunito', `url(${url})`).load();
					return 'loaded';
				} catch {
					return 'refused';
				}
			}, url);

		// A page on the provider's origin, as Auth0's login page is on auth.toebeans.co.za.
		await page.goto(`${MOCK_PROVIDER}/default/.well-known/openid-configuration`);
		expect(await load(font)).toBe('loaded');

		// The same file from another origin: without our CORS header for it, the browser refuses.
		await page.goto('http://127.0.0.1:8090/default/.well-known/openid-configuration');
		expect(await load(font)).toBe('refused');
	});
});

test('the login page font is a woff2 served without a session', async ({ request }) => {
	const response = await request.get('/fonts/nunito-latin.woff2');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('font/woff2');
	expect(response.headers()['access-control-allow-origin']).toBe(MOCK_PROVIDER);
	expect(response.headers()['set-cookie']).toBeUndefined();
	expect((await response.body()).subarray(0, 4).toString('latin1')).toBe('wOF2');
});

test('only the terms and the privacy policy may show in search results (S21.3)', async ({
	request
}) => {
	for (const path of ['/terms', '/privacy']) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
		expect(response.headers()['x-robots-tag'], path).toBeUndefined();
	}
	for (const path of ['/sign-in', '/join/not-a-token', '/', '/readyz', '/api/v1/me']) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.headers()['x-robots-tag'], path).toBe('noindex');
	}
	// Only the edge's robots.txt is public; the app's own, at run.app or locally, shuts crawlers out.
	expect(await (await request.get('/robots.txt')).text()).toMatch(/^Disallow: \/$/m);
});

test('the terms and the privacy policy describe themselves for search results', async ({
	page
}) => {
	for (const path of ['/terms', '/privacy']) {
		await page.goto(path);
		await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{80,}/);
	}
});
