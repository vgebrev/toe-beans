import { expect, test, type Page } from '@playwright/test';

// Token values from src/lib/theme/tokens.ts, as computed colours.
const BEAGLE_BG = 'rgb(255, 251, 245)';
const SHEPHERD_BG = 'rgb(20, 17, 16)';

const background = (page: Page) =>
	page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeColors = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
			(meta) => meta.content
		)
	);

/** Taps the visible segment (the radio input itself is visually hidden). */
async function tap(page: Page, theme: 'System' | 'Light' | 'Dark') {
	await page.locator('label').filter({ hasText: theme }).click();
	await expect(page.getByRole('radio', { name: theme })).toBeChecked();
}

async function choose(page: Page, theme: 'System' | 'Light' | 'Dark') {
	await page.goto('/more');
	await tap(page, theme);
}

for (const [scheme, colour] of [
	['light', BEAGLE_BG],
	['dark', SHEPHERD_BG]
] as const) {
	test.describe(`with the phone in ${scheme} mode`, () => {
		test.use({ colorScheme: scheme });

		test('the app follows the system setting by default', async ({ page }) => {
			await page.goto('/');
			expect(await background(page)).toBe(colour);
			await page.goto('/more');
			await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
		});
	});
}

test.describe('a per-device override', () => {
	test.use({ colorScheme: 'light' });

	test('applies at once, tints the status bar and survives a reload', async ({ page }) => {
		await choose(page, 'Dark');
		expect(await background(page)).toBe(SHEPHERD_BG);
		expect(await themeColors(page)).toEqual(['#141110', '#141110']);

		await page.reload();
		expect(await background(page)).toBe(SHEPHERD_BG);
		await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
	});

	test('is applied before the app loads, so the page never flashes the other theme', async ({
		page
	}) => {
		await choose(page, 'Dark');
		// Block the app's scripts: only the inline pre-paint script in app.html can run.
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.goto('/');
		expect(await background(page)).toBe(SHEPHERD_BG);
	});

	test('going back to System follows the phone again', async ({ page }) => {
		await choose(page, 'Dark');
		await tap(page, 'System');
		expect(await background(page)).toBe(BEAGLE_BG);
		expect(await page.evaluate(() => localStorage.getItem('toe-beans:theme'))).toBeNull();
		expect(await themeColors(page)).toEqual(['#FFFBF5', '#141110']);
	});
});
