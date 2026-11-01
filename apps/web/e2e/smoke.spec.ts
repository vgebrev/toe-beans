import { expect, test } from '@playwright/test';

const destinations = ['/', '/plan', '/history', '/care', '/more'];

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
