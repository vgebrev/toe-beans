// The exercise library (FR-03, NFR-14; ui.md §4.6): every skill area, filtering by chip, and an
// exercise's full instructions. The content is the real library in content/exercises.
import { expect, test } from '@playwright/test';

const areas = [
	'Name',
	'Recall',
	'Toilet training',
	'Calm greetings',
	'Settling',
	'Doorbell',
	'Barking',
	'Loose-lead walking',
	'Around cats'
];

test('the library covers all nine skill areas, and the skill-area filter narrows it', async ({
	page
}) => {
	await page.goto('/more');
	await page.getByRole('link', { name: /Exercise library/ }).click();
	await expect(page).toHaveURL('/library');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Exercise library');
	for (const area of areas) {
		await expect(page.getByRole('heading', { level: 2, name: area, exact: true })).toBeVisible();
	}

	const filter = page.getByRole('button', { name: /^Skill area:/ });
	await expect(filter).toHaveAccessibleName('Skill area: All areas');
	expect((await filter.boundingBox())!.height).toBeGreaterThanOrEqual(48);
	await filter.click();
	const sheet = page.getByRole('dialog', { name: 'Skill area' });
	await expect(sheet.getByRole('link').first()).toHaveText('All areas');
	await expect(sheet.getByRole('link', { name: 'All areas' })).toHaveAttribute(
		'aria-current',
		'true'
	);
	for (const choice of await sheet.getByRole('link').all()) {
		expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(48);
	}
	await sheet.getByRole('link', { name: 'Recall', exact: true }).click();
	await expect(page).toHaveURL('/library?area=recall');
	await expect(sheet).toBeHidden();
	await expect(filter).toHaveAccessibleName('Skill area: Recall');
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Recall']);

	// The filter is in the URL, so it survives a reload.
	await page.reload();
	await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Recall']);
});

test('an exercise shows its full instructions and further reading', async ({ page }) => {
	await page.goto('/library?area=recall');
	await page.getByRole('link', { name: /Recall basics/ }).click();
	await expect(page).toHaveURL('/library/recall-basics');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recall basics');
	for (const section of [
		'Goal',
		'Setup',
		'Steps',
		"You're ready to move on when",
		'If your puppy struggles',
		'Safety',
		'Further reading'
	]) {
		await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
	}
	await expect(page.getByText(/\d+ min/)).toBeVisible();
	expect(
		await page.getByRole('region', { name: 'Steps' }).getByRole('listitem').count()
	).toBeGreaterThan(1);

	// Sources open outside the app, without handing it the opener.
	const source = page.getByRole('region', { name: 'Further reading' }).getByRole('link').first();
	await expect(source).toHaveAttribute('target', '_blank');
	await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
	await expect(source).toHaveAttribute('href', /^https:\/\//);

	// The struggling section has an anchor the Quick log's stressed tip can link to (S7).
	await page.goto('/library/recall-basics#if-struggling');
	await expect(page.locator('#if-struggling')).toBeInViewport();

	await page.getByRole('link', { name: 'Library' }).click();
	await expect(page).toHaveURL('/library');
});

test('an unknown exercise is a 404 page', async ({ page }) => {
	const response = await page.goto('/library/no-such-exercise');
	expect(response?.status()).toBe(404);
});

test('the API needs a session', async ({ playwright, baseURL }) => {
	const anonymous = await playwright.request.newContext({
		baseURL,
		storageState: { cookies: [], origins: [] }
	});
	const list = await anonymous.get('/api/v1/exercises');
	expect(list.status()).toBe(401);
	expect((await anonymous.get('/api/v1/exercises/recall-basics')).status()).toBe(401);
	await anonymous.dispose();
});
