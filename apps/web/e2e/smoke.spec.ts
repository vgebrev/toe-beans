import { expect, test } from '@playwright/test';

const destinations = ['/', '/plan', '/history', '/care', '/more', '/household'];

for (const path of destinations) {
	test(`${path} renders on the phone without errors, sideways scrolling or third parties`, async ({
		page,
		baseURL
	}) => {
		const errors: string[] = [];
		const foreign: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
		// Fonts and icons are self-hosted, so the CSP can stay at 'self' (ui.md §6.4).
		page.on('request', (r) => !r.url().startsWith(baseURL!) && foreign.push(r.url()));

		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await page.evaluate(() => document.fonts.ready);

		// One-handed phone use: content must fit the width (ui.md §1).
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
		expect(errors).toEqual([]);
		expect(foreign).toEqual([]);
	});
}

test('the server is ready and tags responses with a request ID', async ({ request }) => {
	const response = await request.get('/readyz');
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ status: 'ready' });
	expect(response.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});

test('pages carry the CSP with a nonce and the other security headers (architecture §7)', async ({
	page
}) => {
	const response = (await page.goto('/more'))!;
	const headers = response.headers();
	const csp = headers['content-security-policy']!;
	expect(csp).toMatch(/script-src 'self' 'nonce-[\w+/=]+'/);
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("object-src 'none'");
	// app.html's inline theme script runs under it: theme.spec.ts checks the override applies.
	expect(headers).toMatchObject({
		'referrer-policy': 'same-origin',
		'x-content-type-options': 'nosniff',
		'cross-origin-opener-policy': 'same-origin'
	});
	expect(headers['permissions-policy']).toContain('camera=(self)');
	// e2e runs on http://localhost, where HSTS doesn't apply.
	expect(headers).not.toHaveProperty('strict-transport-security');
});

test('only the Latin fonts are preloaded, so text rarely swaps after first paint', async ({
	page
}) => {
	await page.goto('/');
	const fonts = await page
		.locator('link[rel="preload"][as="font"]')
		.evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href.split('/').pop()));
	expect(fonts.map((f) => f!.replace(/\.[\w-]+\.woff2$/, '')).sort()).toEqual([
		'fredoka-latin-wght-normal',
		'nunito-latin-wght-normal'
	]);
});
