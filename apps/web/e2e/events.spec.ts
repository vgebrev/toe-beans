// The behaviour journal (FR-08, NFR-04, NFR-13, scenarios 6 and 9; ui.md J5, J8) and the "+"
// chooser on Today, Plan and History (§2.1). Each test brings its own household, in Johannesburg.
import { expect, test, type Page } from '@playwright/test';
import { blockMockFonts, jsonHeaders, ownHousehold } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

interface Event {
	id: string;
	etag: string;
	category: string;
}

async function record(page: Page, baseURL: string, body: Record<string, unknown>) {
	const response = await page.request.post('/api/v1/behaviour-events', {
		headers: jsonHeaders(baseURL),
		data: JSON.stringify({ category: 'barking', ...body })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as Event;
}

async function openRecordEvent(page: Page) {
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Add' })
		.getByRole('button', { name: /Record event/ })
		.click();
	const sheet = page.getByRole('dialog', { name: 'Record event' });
	await expect(sheet).toBeVisible();
	return sheet;
}

test('scenario 6: a barking incident recorded for a chosen dog, without a session', async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!, { dogs: ['Rosie', 'Miso'] });
	await page.goto('/');
	const sheet = await openRecordEvent(page);

	// With two dogs and All dogs showing, Save says what's missing (ui.md §5.1).
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText('Choose which dog it was.')).toBeVisible();
	await expect(sheet.getByText('Choose what happened.')).toBeVisible();

	await sheet.getByRole('radio', { name: 'Miso' }).click();
	await sheet.getByRole('radio', { name: 'Barking' }).click();
	await sheet.getByRole('radio', { name: '15 min ago' }).click();
	await sheet.getByLabel(/Trigger/).fill('Delivery van at the gate');
	await sheet.getByLabel(/How your puppy responded/).fill('Barked twice, then came when called');
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('status')).toContainText("Recorded Miso's barking.");

	await page.getByRole('link', { name: 'See the event' }).click();
	await expect(page).toHaveURL(/\/events\//);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Barking');
	await expect(page.getByText('Miso', { exact: true })).toBeVisible();
	await expect(page.getByText('Delivery van at the gate')).toBeVisible();
	await expect(page.getByText('Barked twice, then came when called')).toBeVisible();
	await expect(page.getByText(/^Today at \d\d:\d\d$/)).toBeVisible();

	// No training session was planned or logged for it.
	const today = await (await page.request.get('/api/v1/today')).json();
	expect(today).toMatchObject({ overdue: [], planned: [], done: [], skipped: [] });
});

test('the switcher’s dog starts the sheet, from Plan and History too', async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!, { dogs: ['Rosie', 'Miso'] });
	await page.goto('/history');
	await page.getByRole('button', { name: /Show dog/ }).click();
	await page
		.getByRole('dialog', { name: 'Show dog' })
		.getByRole('button', { name: /Rosie/ })
		.click();
	const sheet = await openRecordEvent(page);
	await expect(sheet.getByRole('radio', { name: 'Rosie' })).toHaveAttribute('aria-checked', 'true');
	await sheet.getByRole('radio', { name: 'Visitor' }).click();
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText("Recorded Rosie's visitor.");

	await page.goto('/plan');
	await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
});

test('logging training from the "+": pick an exercise, then the quick log', async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Add' })
		.getByRole('button', { name: /Log training/ })
		.click();
	const picker = page.getByRole('dialog', { name: 'Choose an exercise' });
	await picker.getByRole('button', { name: /Recall basics/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Log practice' });
	await expect(sheet.getByText('Rosie')).toBeVisible();
	await expect(sheet.getByRole('radio', { name: 'Not assessed' })).toBeChecked();
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('status')).toContainText('Logged Recall basics for Rosie.');
	// Today shows it under Done straight away.
	await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
});

test('a failed save keeps everything entered and offers Retry (NFR-04)', async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	const sheet = await openRecordEvent(page);
	await sheet.getByRole('radio', { name: 'Toileting accident' }).click();
	await sheet.getByLabel(/Notes/).fill('By the back door');

	await page.route('**/api/v1/behaviour-events', (route) => route.abort('internetdisconnected'));
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText("Couldn't save — check your connection.")).toBeVisible();
	await expect(sheet.getByRole('radio', { name: 'Toileting accident' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(sheet.getByLabel(/Notes/)).toHaveValue('By the back door');

	await page.unroute('**/api/v1/behaviour-events');
	await sheet.getByRole('button', { name: 'Retry' }).click();
	await expect(sheet).toBeHidden();
	await page.getByRole('link', { name: 'See the event' }).click();
	await expect(page.getByText('By the back door')).toBeVisible();
});

test('editing an event, and a change made elsewhere meanwhile (NFR-13)', async ({
	page,
	baseURL
}) => {
	const [rosie, miso] = await ownHousehold(page, baseURL!, { dogs: ['Rosie', 'Miso'] });
	const event = await record(page, baseURL!, { dogId: rosie!.id, trigger: 'Doorbell' });
	await page.goto(`/events/${event.id}`);
	await expect(page.getByText('Doorbell')).toBeVisible();

	// Someone else saves first.
	const theirs = await page.request.patch(`/api/v1/behaviour-events/${event.id}`, {
		headers: { ...jsonHeaders(baseURL!), 'if-match': event.etag },
		data: JSON.stringify({ category: 'fear' })
	});
	expect(theirs.status()).toBe(200);

	await page.getByRole('button', { name: 'Edit' }).click();
	const sheet = page.getByRole('dialog', { name: 'Edit event' });
	await expect(sheet.getByRole('radio', { name: 'Barking' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await sheet.getByRole('radio', { name: 'Visitor' }).click();
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText(/changed this a moment ago/)).toBeVisible();
	await sheet.getByRole('button', { name: 'See their version' }).click();
	await expect(sheet.getByRole('radio', { name: 'Fear' })).toHaveAttribute('aria-checked', 'true');

	// Recorded against the wrong dog: moved to Miso.
	await sheet.getByRole('radio', { name: 'Miso' }).click();
	await sheet.getByLabel(/Trigger/).fill('Doorbell and knocking');
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('Saved.')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fear');
	await expect(page.getByText('Doorbell and knocking')).toBeVisible();
	const saved = await (await page.request.get(`/api/v1/behaviour-events/${event.id}`)).json();
	expect(saved).toMatchObject({ dogId: miso!.id, category: 'fear', etag: '"3"' });
});

test("another household can't read, change or record against a household's data (scenario 9)", async ({
	page,
	browser,
	baseURL
}) => {
	const [rosie] = await ownHousehold(page, baseURL!);
	const event = await record(page, baseURL!, { dogId: rosie!.id });

	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const outsider = await context.newPage();
	await blockMockFonts(outsider);
	await ownHousehold(outsider, baseURL!);
	const responses = await Promise.all([
		outsider.request.get(`/api/v1/behaviour-events/${event.id}`),
		outsider.request.patch(`/api/v1/behaviour-events/${event.id}`, {
			headers: { ...jsonHeaders(baseURL!), 'if-match': event.etag },
			data: JSON.stringify({ category: 'fear' })
		}),
		outsider.request.post('/api/v1/behaviour-events', {
			headers: jsonHeaders(baseURL!),
			data: JSON.stringify({ dogId: rosie!.id, category: 'fear' })
		})
	]);
	expect(responses.map((r) => r.status())).toEqual([404, 404, 400]);
	expect((await outsider.goto(`/events/${event.id}`))?.status()).toBe(404);
	await expect(outsider.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that");

	// Untouched for its own household.
	const own = await (await page.request.get(`/api/v1/behaviour-events/${event.id}`)).json();
	expect(own).toMatchObject({ category: 'barking', etag: event.etag });
	await context.close();
});
