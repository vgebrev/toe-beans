// Today (FR-06, scenario 3; ui.md §4.1): overdue, planned, done and skipped for the household,
// each dog named, with the quick log one tap from a card. Each test brings its own household, in
// Johannesburg. Times are on the real clock: 00:00 today has passed and 23:55 hasn't, unless the
// suite runs in the five minutes either side of midnight there.
import { expect, test, type Page } from '@playwright/test';
import { addDog, blockMockFonts, createHousehold, newPerson, signIn } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

const ZONE = 'Africa/Johannesburg';
const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());

async function household(page: Page, baseURL: string, dogs: string[]) {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL);
	const added = [];
	for (const name of dogs) added.push(await addDog(page, baseURL, { name }));
	return added;
}

async function schedule(
	page: Page,
	baseURL: string,
	body: { dogId: string; exerciseId: string; time: string }
) {
	const response = await page.request.post('/api/v1/planned-sessions', {
		headers: json(baseURL),
		data: JSON.stringify({ date: today(), ...body })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as { id: string; etag: string };
}

test('FR-06: overdue, planned, done and skipped, each dog named, logged from its card', async ({
	page,
	baseURL
}) => {
	const [rosie, miso] = await household(page, baseURL!, ['Rosie', 'Miso']);
	await schedule(page, baseURL!, { dogId: rosie!.id, exerciseId: 'recall-basics', time: '00:00' });
	await schedule(page, baseURL!, { dogId: miso!.id, exerciseId: 'recall-basics', time: '23:55' });
	const skipped = await schedule(page, baseURL!, {
		dogId: rosie!.id,
		exerciseId: 'name-game',
		time: '23:55'
	});
	await page.request.patch(`/api/v1/planned-sessions/${skipped.id}`, {
		headers: { ...json(baseURL!), 'if-match': skipped.etag },
		data: JSON.stringify({ status: 'skipped' })
	});
	const adHoc = await page.request.post('/api/v1/session-logs', {
		headers: json(baseURL!),
		data: JSON.stringify({ dogId: miso!.id, exerciseId: 'name-game', outcome: 'successful' })
	});
	expect(adHoc.status()).toBe(201);

	await page.goto('/');
	const overdue = page.getByRole('region', { name: 'Overdue (1)' });
	const planned = page.getByRole('region', { name: 'Planned' });
	const done = page.getByRole('region', { name: 'Done' });
	await expect(overdue.getByRole('link', { name: /Recall basics/ })).toContainText('Rosie');
	await expect(planned.getByRole('link', { name: /Recall basics/ })).toContainText('Miso');
	const practised = done.getByRole('link', { name: /name game/i });
	await expect(practised).toContainText('Miso');
	await expect(practised).toContainText('Successful');
	await expect(practised).toContainText('by Test owner');
	// Skipped is collapsed, and never among the done.
	const skippedGroup = page.getByText('Skipped (1)');
	await expect(skippedGroup).toBeVisible();
	await expect(page.getByRole('link', { name: /name game.*Rosie/i })).toBeHidden();
	await skippedGroup.click();
	await expect(page.getByRole('link', { name: /name game.*Rosie/i })).toContainText('Skipped');

	// The quick log straight from the overdue card: Rosie's, not Miso's (J3).
	const started = Date.now();
	await overdue.getByRole('button', { name: 'Log Recall basics for Rosie' }).click();
	const sheet = page.getByRole('dialog', { name: 'Log practice' });
	await expect(sheet.getByText('Rosie')).toBeVisible();
	await expect(sheet.getByRole('radio', { name: 'Not assessed' })).toBeChecked();
	await sheet.getByRole('radio', { name: 'Partially successful' }).check({ force: true });
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('Logged. Recall basics is done.')).toBeVisible();
	const seconds = (Date.now() - started) / 1000;
	test.info().annotations.push({ type: 'quick log from Today', description: `${seconds} s` });
	expect(seconds).toBeLessThan(30);
	await expect(page.getByRole('region', { name: /Overdue/ })).toBeHidden();
	const logged = done.getByRole('link', { name: /Recall basics/ });
	await expect(logged).toContainText('Rosie');
	await expect(logged).toContainText('Partially successful');

	// The switcher keeps each dog's day apart.
	await page.getByRole('button', { name: /^Show dog:/ }).click();
	await page
		.getByRole('dialog', { name: 'Show dog' })
		.getByRole('button', { name: 'Miso' })
		.click();
	await expect(done.getByRole('link')).toHaveCount(1);
	await expect(done.getByRole('link', { name: /name game/i })).toBeVisible();
	await expect(planned.getByRole('link', { name: /Recall basics/ })).toContainText('Miso');
	await expect(page.getByText('Skipped (1)')).toBeHidden();

	// A planned card opens its session.
	await planned.getByRole('link', { name: /Recall basics/ }).click();
	await expect(page).toHaveURL(/\/sessions\//);
	await expect(page.getByRole('button', { name: 'Log practice' })).toBeVisible();
});

test('an empty day suggests scheduling from the library', async ({ page, baseURL }) => {
	await household(page, baseURL!, ['Rosie']);
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Nothing planned today' })).toBeVisible();
	await page.getByRole('link', { name: 'Schedule' }).click();
	await expect(page).toHaveURL(new RegExp(`/plan/new\\?date=${today()}`));
});

test('a failed load says so rather than showing an empty day (NFR-04)', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!, ['Rosie']);
	await page.route('**/api/v1/today', (route) => route.abort('internetdisconnected'));
	await page.goto('/plan');
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click();
	await expect(
		page.getByText("Couldn't load today — check your connection, then reload.")
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Nothing planned today' })).toBeHidden();
});
