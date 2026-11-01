import { expect, test } from '@playwright/test';

test('the home page renders on the phone without errors or sideways scrolling', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

	// One-handed phone use: content must fit the width (ui.md §1).
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	expect(errors).toEqual([]);
});

test('the server is ready and tags responses with a request ID', async ({ request }) => {
	const response = await request.get('/readyz');
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ status: 'ready' });
	expect(response.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});
