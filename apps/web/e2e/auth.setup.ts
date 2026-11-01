// Signs in once and saves the session, so the other suites start signed in (playwright.config.ts).
import { expect, test as setup } from '@playwright/test';
import { blockMockFonts, newPerson, SIGNED_IN, signInAtMockProvider } from './mock-sign-in.js';

setup('sign in', async ({ page }) => {
	await blockMockFonts(page);
	await page.goto('/sign-in');
	await page.getByRole('link', { name: 'Sign in' }).click();
	await signInAtMockProvider(page, newPerson('viewer'));
	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
	await page.context().storageState({ path: SIGNED_IN });
});
