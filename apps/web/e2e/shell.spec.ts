import { expect, test } from '@playwright/test';

const tabs = [
	{ name: 'Today', path: '/' },
	{ name: 'Plan', path: '/plan' },
	{ name: 'History', path: '/history' },
	{ name: 'Care', path: '/care' },
	{ name: 'More', path: '/more' }
];

test('the bottom bar reaches every destination and marks the current one', async ({ page }) => {
	await page.goto('/');
	const nav = page.getByRole('navigation', { name: 'Main' });

	for (const tab of tabs) {
		await nav.getByRole('link', { name: tab.name }).click();
		await expect(page).toHaveURL(tab.path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(tab.name);
		await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
		await expect(nav.getByRole('link', { name: tab.name })).toHaveAttribute('aria-current', 'page');
	}
});

test('the bottom bar sits on screen with thumb-sized targets (ui.md §1)', async ({ page }) => {
	await page.goto('/');
	const viewport = page.viewportSize()!;
	const nav = page.getByRole('navigation', { name: 'Main' });

	const bar = (await nav.boundingBox())!;
	expect(bar.y + bar.height).toBeLessThanOrEqual(viewport.height);

	for (const link of await nav.getByRole('link').all()) {
		const box = (await link.boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(48);
		expect(box.height).toBeGreaterThanOrEqual(48);
	}
});

test('the end of a page scrolls clear of the bottom bar', async ({ page }) => {
	await page.goto('/more');
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	const bar = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
	const last = (await page.getByText(/^Version /).boundingBox())!;
	expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
});

test('self-hosted fonts load: Nunito for text, Fredoka for titles', async ({ page }) => {
	await page.goto('/');
	const loaded = await page.evaluate(async () => {
		await document.fonts.ready;
		return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
	});
	expect(loaded).toEqual(expect.arrayContaining(['Nunito Variable', 'Fredoka Variable']));
	await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
		'font-family',
		/^"Fredoka Variable"/
	);
	await expect(page.locator('body')).toHaveCSS('font-family', /^"Nunito Variable"/);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the shell and its icons are in the server-rendered page', async ({ page }) => {
		await page.goto('/plan');
		const nav = page.getByRole('navigation', { name: 'Main' });
		await expect(nav.getByRole('link')).toHaveCount(5);
		await expect(nav.locator('svg[data-icon="plan"] path').first()).toBeAttached();
		await expect(nav.getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page');
	});
});

test('an unknown address shows the Not found page, with a way back', async ({ page }) => {
	const response = await page.goto('/no-such-page');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that");
	await page.getByRole('link', { name: 'Go to Today' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
});
