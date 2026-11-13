// The care calendar (FR-10, NFR-13, scenarios 5, 7 and 9; ui.md J6). Each test brings its own
// household, in Johannesburg.
import { expect, test, type Page } from '@playwright/test';
import { addDog, blockMockFonts, createHousehold, newPerson, signIn } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });

/** A date on Johannesburg's clocks, `days` from today. */
const dayFromToday = (days: number) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(
		new Date(Date.now() + days * 24 * 60 * 60_000)
	);

async function household(page: Page, baseURL: string, dogs: string[] = ['Rosie']) {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL);
	const added = [];
	for (const name of dogs) added.push(await addDog(page, baseURL, { name }));
	return added;
}

async function addCare(page: Page, baseURL: string, body: Record<string, unknown>) {
	const response = await page.request.post('/api/v1/care-tasks', {
		headers: json(baseURL),
		data: JSON.stringify({ category: 'vaccination', ...body })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as { id: string; etag: string; title: string };
}

test('scenario 7: a vaccination for one dog shows on Care and Today, and is marked done', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!, ['Rosie', 'Miso']);
	await page.goto('/');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Add' })
		.getByRole('link', { name: /Add care task/ })
		.click();
	await expect(page.getByRole('heading', { name: 'Add care task' })).toBeVisible();

	// Nothing chosen yet: the form says what's missing (ui.md §5.1).
	await page.getByRole('button', { name: 'Add care task' }).click();
	await expect(page.getByText('Choose a dog.')).toBeVisible();
	await expect(page.getByText('Choose what kind of care it is.')).toBeVisible();
	await expect(page.getByText('Choose a date.')).toBeVisible();

	await page.getByRole('radio', { name: 'Miso' }).check({ force: true });
	await page.getByRole('radio', { name: 'Vaccination' }).check({ force: true });
	await expect(page.getByLabel('Title')).toHaveValue('Vaccination');
	await page.getByLabel('Title').fill('Second puppy vaccination');
	await page.getByLabel('Date').fill(dayFromToday(2));
	await page.getByLabel(/Time/).fill('09:30');
	await page.getByLabel(/Notes/).fill('Bring the vaccination card');
	await page.getByRole('button', { name: 'Add care task' }).click();

	await expect(page).toHaveURL(/\/care$/);
	await expect(
		page.getByText(/Added Second puppy vaccination for Miso, .+ at 09:30\./)
	).toBeVisible();
	const card = page.getByRole('link', { name: /Second puppy vaccination/ });
	await expect(card).toContainText('Miso');

	// Today's Coming up, within the week.
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	const comingUp = page.getByRole('region', { name: 'Coming up' });
	await expect(comingUp.getByRole('link', { name: /Second puppy vaccination/ })).toBeVisible();

	// Done, with the next one planned a year on.
	await comingUp.getByRole('link', { name: /Second puppy vaccination/ }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Second puppy vaccination');
	await expect(page.getByText('Bring the vaccination card')).toBeVisible();
	await page.getByRole('button', { name: 'Mark done' }).click();
	const sheet = page.getByRole('dialog', { name: /Mark Second puppy vaccination done/ });
	await expect(sheet.getByLabel('Done on')).toHaveValue(dayFromToday(0));
	await sheet.getByRole('radio', { name: 'In a year' }).check({ force: true });
	await sheet.getByRole('button', { name: 'Mark done' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText(/Done\. The next one is planned for .+\./)).toBeVisible();
	await expect(page.getByText('Marked done, on')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Not done after all' })).toBeVisible();

	await page.getByRole('link', { name: 'See the next one' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Second puppy vaccination');
	await expect(page.getByRole('button', { name: 'Mark done' })).toBeVisible();

	// Off Today's Coming up now, and under Done on Care.
	await page.goto('/');
	await expect(page.getByRole('region', { name: 'Coming up' })).toBeHidden();
	await page.goto('/care');
	await page.getByText(/Done and cancelled \(1\)/).click();
	await expect(page.getByRole('link', { name: /Second puppy vaccination.*Done/ })).toBeVisible();
});

test('an overdue task says so on Care and Today, and a move goes into its history', async ({
	page,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	const task = await addCare(page, baseURL!, {
		dogId: rosie!.id,
		category: 'parasite_prevention',
		dueDate: dayFromToday(-3)
	});
	await page.goto('/');
	await expect(
		page
			.getByRole('region', { name: 'Coming up' })
			.getByRole('link', { name: /Parasite prevention/ })
	).toContainText('Overdue');
	await page.goto('/care');
	await expect(page.getByRole('heading', { name: 'Overdue (1)' })).toBeVisible();

	await page.goto(`/care/${task.id}`);
	await page.getByRole('link', { name: 'Change' }).click();
	await page.getByLabel('Date').fill(dayFromToday(10));
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await expect(page.getByText(/^Moved from .+ to .+$/)).toBeVisible();
	await expect(page.getByText(/^Added for /)).toBeVisible();
});

test('a change made elsewhere is never overwritten (NFR-13)', async ({ page, baseURL }) => {
	const [rosie] = await household(page, baseURL!);
	const task = await addCare(page, baseURL!, { dogId: rosie!.id, dueDate: dayFromToday(5) });
	await page.goto(`/care/${task.id}/edit`);
	// Someone else saves first.
	expect(
		(
			await page.request.patch(`/api/v1/care-tasks/${task.id}`, {
				headers: { ...json(baseURL!), 'if-match': task.etag },
				data: JSON.stringify({ notes: 'From the other phone' })
			})
		).status()
	).toBe(200);
	await page.getByLabel(/Notes/).fill('Mine');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText(/changed this a moment ago, so nothing was saved/)).toBeVisible();
	await page.getByRole('button', { name: 'See their version' }).click();
	await expect(page.getByLabel(/Notes/)).toHaveValue('From the other phone');
});

test('scenario 5: a cancelled task’s page says so, and it can be put back', async ({
	page,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	const task = await addCare(page, baseURL!, {
		dogId: rosie!.id,
		category: 'vet_appointment',
		dueDate: dayFromToday(1),
		dueTime: '10:00'
	});
	await page.goto(`/care/${task.id}`);
	await page.getByRole('button', { name: 'Cancel…' }).click();
	await page.getByRole('button', { name: 'Cancel care task' }).click();
	await expect(page.getByText('This care task was cancelled.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Go to Today' })).toBeVisible();

	await page.getByRole('button', { name: 'Put it back' }).click();
	await expect(page.getByText(/Put back as upcoming, tomorrow at 10:00\./)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mark done' })).toBeVisible();
});

test('scenario 9: another household’s task can’t be reached by its ID', async ({
	page,
	baseURL,
	browser
}) => {
	const [rosie] = await household(page, baseURL!);
	const task = await addCare(page, baseURL!, { dogId: rosie!.id, dueDate: dayFromToday(3) });

	const other = await browser.newPage();
	await blockMockFonts(other);
	await signIn(other, newPerson('stranger'));
	await createHousehold(other, baseURL!);
	expect((await other.request.get(`/api/v1/care-tasks/${task.id}`)).status()).toBe(404);
	expect(
		(
			await other.request.post(`/api/v1/care-tasks/${task.id}/complete`, {
				headers: { ...json(baseURL!), 'if-match': task.etag },
				data: '{}'
			})
		).status()
	).toBe(404);
	expect(
		((await (await other.request.get('/api/v1/care-tasks')).json()) as { upcoming: [] }).upcoming
	).toEqual([]);
	await other.goto(`/care/${task.id}`);
	await expect(other.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that");
	await other.close();
});
