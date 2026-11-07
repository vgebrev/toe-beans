// Signs in once, with a household, and saves the session, so the other suites start past
// onboarding (playwright.config.ts).
import { expect, test as setup } from '@playwright/test';
import { blockMockFonts, createHousehold, newPerson, SIGNED_IN, signIn } from './mock-sign-in.js';

setup('sign in', async ({ page, baseURL }) => {
	await blockMockFonts(page);
	await signIn(page, newPerson('viewer'));
	await expect(page).toHaveURL('/onboarding');
	await createHousehold(page, baseURL!);
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
	await page.context().storageState({ path: SIGNED_IN });
});
