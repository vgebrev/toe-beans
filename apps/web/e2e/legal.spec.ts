// The privacy policy and terms (backlog S16.4): public, and linked from sign-in and More.
import { expect, test } from '@playwright/test';

test.describe('signed out', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('the sign-in page links back to the landing page, loaded afresh from the edge (D44)', async ({
		page
	}) => {
		await page.goto('/sign-in');
		const about = page.getByRole('link', { name: 'About Toe Beans' });
		await expect(about).toHaveAttribute('href', '/');
		await expect(about).toHaveAttribute('data-sveltekit-reload', '');
	});

	test('the sign-in page links to both, and they open without signing in', async ({ page }) => {
		await page.goto('/sign-in');
		await page.getByRole('link', { name: 'Privacy policy' }).click();
		await expect(page).toHaveURL(/\/privacy$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
		await expect(page.getByText(/^Last updated \d+ \w+ \d{4}$/)).toBeVisible();
		await expect(page.getByRole('heading', { level: 2, name: '7. Your rights' })).toBeVisible();
		await expect(page).toHaveTitle('Privacy policy · Toe Beans');

		await page.goto('/sign-in');
		await page.getByRole('link', { name: 'Terms of service' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible();
		// The terms point at the policy.
		await page.getByRole('main').getByRole('link', { name: 'privacy policy' }).first().click();
		await expect(page).toHaveURL(/\/privacy$/);
	});

	test('the back link goes to the app, which asks to sign in', async ({ page }) => {
		await page.goto('/terms');
		await page.getByRole('link', { name: 'Toe Beans' }).click();
		await expect(page).toHaveURL(/\/sign-in/);
	});
});

test('More links to both', async ({ page }) => {
	await page.goto('/more');
	await page.getByRole('link', { name: 'Privacy policy' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
	// Back to where the person came from.
	await page.goBack();
	await page.getByRole('link', { name: 'Terms of service' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible();
});
