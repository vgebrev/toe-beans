// History (FR-09, FR-08, NFR-13, scenario 9; ui.md §4.4, J8): logs and events in one timeline
// with filters, and deleting from a log's or event's page with Undo. Each test brings its own
// household, in Johannesburg.
import { expect, test, type Page } from '@playwright/test';
import { addDog, blockMockFonts, createHousehold, newPerson, signIn } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

const ZONE = 'Africa/Johannesburg';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function household(page: Page, baseURL: string, dogs: string[] = ['Rosie']) {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL);
	const added = [];
	for (const name of dogs) added.push(await addDog(page, baseURL, { name }));
	return added;
}

interface Saved {
	id: string;
	etag: string;
}

async function logPractice(page: Page, baseURL: string, body: Record<string, unknown>) {
	const response = await page.request.post('/api/v1/session-logs', {
		headers: json(baseURL),
		data: JSON.stringify({ exerciseId: 'recall-basics', ...body })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as Saved;
}

async function record(page: Page, baseURL: string, body: Record<string, unknown>) {
	const response = await page.request.post('/api/v1/behaviour-events', {
		headers: json(baseURL),
		data: JSON.stringify({ category: 'barking', ...body })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as Saved;
}

const cards = (page: Page) => page.getByRole('main').getByRole('listitem');

test('FR-09: logs and events in one timeline, newest first by day, with filters', async ({
	page,
	baseURL
}) => {
	const [rosie, miso] = await household(page, baseURL!, ['Rosie', 'Miso']);
	await logPractice(page, baseURL!, { dogId: rosie!.id, practisedAt: ago(60) });
	await record(page, baseURL!, { dogId: miso!.id, occurredAt: ago(30), trigger: 'Postman' });
	await logPractice(page, baseURL!, {
		dogId: miso!.id,
		exerciseId: 'name-game',
		practisedAt: ago(3 * 24 * 60),
		outcome: 'successful'
	});
	await record(page, baseURL!, {
		dogId: rosie!.id,
		category: 'fear',
		occurredAt: ago(3 * 24 * 60 + 60)
	});

	await page.goto('/history');
	await expect(cards(page)).toHaveCount(4);
	await expect(page.getByRole('heading', { level: 2, name: 'Today' })).toBeVisible();
	await expect(cards(page).nth(0)).toContainText('Barking');
	await expect(cards(page).nth(0)).toContainText('Postman');
	await expect(cards(page).nth(0)).toContainText('Miso');
	await expect(cards(page).nth(1)).toContainText('Recall basics');
	await expect(cards(page).nth(1)).toContainText('Not assessed');
	await expect(cards(page).nth(2)).toContainText('The name game');
	await expect(cards(page).nth(3)).toContainText('Fear');

	// One kind of event (FR-09's event type), kept in the URL.
	await page.getByRole('button', { name: 'Show: Everything' }).click();
	await page.getByRole('dialog', { name: 'Show' }).getByRole('link', { name: 'Fear' }).click();
	await expect(page).toHaveURL(/type=fear/);
	await expect(cards(page)).toHaveCount(1);
	await expect(cards(page).nth(0)).toContainText('Fear');

	// An exercise leaves only training.
	await page.getByRole('button', { name: /Exercise: All exercises/ }).click();
	await page
		.getByRole('dialog', { name: 'Exercise' })
		.getByRole('button', { name: /The name game/ })
		.click();
	await expect(page).toHaveURL(/exercise=name-game/);
	await expect(page).not.toHaveURL(/type=/);
	await expect(cards(page)).toHaveCount(1);
	await expect(cards(page).nth(0)).toContainText('The name game');

	// Dates, on the household's clocks; a reload keeps the filters.
	await page.goto('/history');
	await page.getByRole('button', { name: 'Dates: All time' }).click();
	await page
		.getByRole('dialog', { name: 'Dates' })
		.getByRole('button', { name: 'Choose dates…' })
		.click();
	const dates = page.getByRole('dialog', { name: 'Choose dates' });
	await dates.getByLabel(/From/).fill(today());
	await dates.getByRole('button', { name: 'Show these dates' }).click();
	await expect(page).toHaveURL(new RegExp(`from=${today()}`));
	await expect(cards(page)).toHaveCount(2);
	await page.reload();
	await expect(cards(page)).toHaveCount(2);

	// The switcher's dog.
	await page.goto('/history');
	await page.getByRole('button', { name: /Show dog/ }).click();
	await page
		.getByRole('dialog', { name: 'Show dog' })
		.getByRole('button', { name: 'Miso' })
		.click();
	await expect(cards(page)).toHaveCount(2);
	await expect(cards(page).nth(0)).toContainText('Barking');
	await expect(cards(page).nth(1)).toContainText('The name game');

	// Nothing matching says so, with a way out.
	await page.goto('/history?type=visitor');
	await expect(page.getByText('Nothing matches these filters for Miso.')).toBeVisible();
	await page.getByRole('link', { name: 'Clear filters' }).click();
	await expect(cards(page)).toHaveCount(2);
});

/** Counts the History list requests the page makes from now on. */
function countLoads(page: Page) {
	const seen = { loads: 0 };
	page.on('request', (r) => {
		if (new URL(r.url()).pathname === '/api/v1/history') seen.loads++;
	});
	return seen;
}

test('Load more pages through the timeline, and Back from an entry keeps the list', async ({
	page,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	for (let i = 0; i < 32; i++) {
		await logPractice(page, baseURL!, { dogId: rosie!.id, practisedAt: ago(10 + i) });
	}
	await page.goto('/history');
	await expect(cards(page)).toHaveCount(30);
	await page.getByRole('button', { name: 'Load more' }).click();
	await expect(cards(page)).toHaveCount(32);
	await expect(page.getByRole('button', { name: 'Load more' })).toBeHidden();

	// Back from the oldest shows both pages, where it was, without asking again.
	const seen = countLoads(page);
	await cards(page).last().click();
	await expect(page).toHaveURL(/\/logs\//);
	await page.goBack();
	await expect(cards(page)).toHaveCount(32);
	await expect(cards(page).last()).toBeInViewport();
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
	expect(seen.loads).toBe(0);

	// Back after a change there asks again, so the list shows it.
	await cards(page).first().click();
	await page.getByRole('button', { name: 'Edit' }).click();
	const sheet = page.getByRole('dialog', { name: 'Edit log' });
	await sheet.getByRole('radio', { name: 'Not yet successful' }).check({ force: true });
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.goBack();
	await expect(cards(page).first()).toContainText('Not yet successful');
	expect(seen.loads).toBe(1);

	// Coming by the tab is a fresh look.
	await page.getByRole('link', { name: 'Today' }).click();
	await expect(page).toHaveURL(/\/$/);
	await page.getByRole('link', { name: 'History' }).click();
	await expect(cards(page)).toHaveCount(30);
	expect(seen.loads).toBe(2);
});

test('a failed load says so and offers to try again (NFR-04)', async ({ page, baseURL }) => {
	const [rosie] = await household(page, baseURL!);
	await logPractice(page, baseURL!, { dogId: rosie!.id });
	await page.route('**/api/v1/history*', (route) => route.abort('internetdisconnected'));
	await page.goto('/history');
	await expect(page.getByText("Couldn't load your history — check your connection.")).toBeVisible();
	await expect(page.getByText('No history yet')).toBeHidden();
	await page.unroute('**/api/v1/history*');
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(cards(page)).toHaveCount(1);
});

test('J8: deleting a planned session’s log puts it back in the plan, and Undo completes it', async ({
	page,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	const scheduled = await page.request.post('/api/v1/planned-sessions', {
		headers: json(baseURL!),
		data: JSON.stringify({
			dogId: rosie!.id,
			exerciseId: 'recall-basics',
			date: today(),
			time: '00:00'
		})
	});
	const session = (await scheduled.json()) as Saved;
	const log = await logPractice(page, baseURL!, { plannedSessionId: session.id });

	await page.goto(`/logs/${log.id}`);
	await page.getByRole('button', { name: 'Delete this log' }).click();
	const sheet = page.getByRole('dialog', {
		name: /^Delete Rosie's Recall basics log from today at \d\d:\d\d\?$/
	});
	await sheet.getByRole('button', { name: 'Delete log' }).click();
	await expect(page).toHaveURL(/\/history$/);
	await expect(page.getByRole('status')).toContainText("Deleted Rosie's Recall basics log.");
	await expect(page.getByText('No history yet')).toBeVisible();
	const reopened = await (await page.request.get('/api/v1/today')).json();
	expect(reopened.overdue).toEqual([expect.objectContaining({ id: session.id })]);

	const seen = countLoads(page);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('The log is back.');
	await expect(cards(page)).toHaveCount(1);
	expect(seen.loads).toBe(0);
	const done = await (await page.request.get(`/api/v1/planned-sessions/${session.id}`)).json();
	expect(done).toMatchObject({ status: 'completed' });

	// Back to History doesn't offer Undo again.
	await page.getByRole('link', { name: 'See the log' }).click();
	await page.goBack();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
});

test('J8: deleting an event with Undo, and a change made meanwhile deletes nothing', async ({
	page,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	const event = await record(page, baseURL!, { dogId: rosie!.id, occurredAt: ago(5) });

	// Changed on another device after this page loaded (NFR-13).
	await page.goto(`/events/${event.id}`);
	await page.request.patch(`/api/v1/behaviour-events/${event.id}`, {
		headers: { ...json(baseURL!), 'if-match': event.etag },
		data: JSON.stringify({ category: 'visitor' })
	});
	await page.getByRole('button', { name: 'Delete this event' }).click();
	let sheet = page.getByRole('dialog', { name: /^Delete Rosie's barking from today at/ });
	await sheet.getByRole('button', { name: 'Delete event' }).click();
	await expect(
		sheet.getByText('Someone changed this a moment ago, so nothing was deleted.')
	).toBeVisible();
	await sheet.getByRole('button', { name: 'See the changes' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Visitor');

	// Their version deletes, and Undo brings it back.
	await page.getByRole('button', { name: 'Delete this event' }).click();
	sheet = page.getByRole('dialog', { name: /^Delete Rosie's visitor from today at/ });
	await page.route('**/api/v1/behaviour-events/*', (route) => route.abort('internetdisconnected'));
	await sheet.getByRole('button', { name: 'Delete event' }).click();
	await expect(sheet.getByText("Couldn't delete — check your connection.")).toBeVisible();
	await page.unroute('**/api/v1/behaviour-events/*');
	await sheet.getByRole('button', { name: 'Retry' }).click();
	await expect(page).toHaveURL(/\/history$/);
	await expect(page.getByRole('status')).toContainText("Deleted Rosie's visitor.");
	await expect(cards(page)).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('The event is back.');
	await expect(cards(page)).toHaveCount(1);
	await expect(cards(page).nth(0)).toContainText('Visitor');
});

test("another household can't list, delete or restore a household's entries (scenario 9)", async ({
	page,
	browser,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	const log = await logPractice(page, baseURL!, { dogId: rosie!.id });
	const event = await record(page, baseURL!, { dogId: rosie!.id });

	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const outsider = await context.newPage();
	await blockMockFonts(outsider);
	await household(outsider, baseURL!);
	const removed = await Promise.all([
		outsider.request.delete(`/api/v1/session-logs/${log.id}`, {
			headers: { origin: baseURL!, 'if-match': log.etag }
		}),
		outsider.request.delete(`/api/v1/behaviour-events/${event.id}`, {
			headers: { origin: baseURL!, 'if-match': event.etag }
		})
	]);
	expect(removed.map((r) => r.status())).toEqual([404, 404]);
	expect(await (await outsider.request.get(`/api/v1/history?dog=${rosie!.id}`)).json()).toEqual({
		entries: []
	});

	// Deleted by its own household, it still can't be brought back by another.
	const deleted = await page.request.delete(`/api/v1/behaviour-events/${event.id}`, {
		headers: { origin: baseURL!, 'if-match': event.etag }
	});
	expect(deleted.status()).toBe(204);
	const restore = await outsider.request.post(`/api/v1/behaviour-events/${event.id}/restore`, {
		headers: { origin: baseURL!, 'if-match': deleted.headers().etag! }
	});
	expect(restore.status()).toBe(404);
	const own = await (await page.request.get('/api/v1/history')).json();
	expect(own.entries).toEqual([expect.objectContaining({ kind: 'training' })]);
	await context.close();
});
