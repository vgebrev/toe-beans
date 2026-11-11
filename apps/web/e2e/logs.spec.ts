// The quick training log (FR-07, NFR-04, NFR-13, scenarios 3 and 9; ui.md J3, J4, §4.2). Each
// test brings its own household, in Johannesburg.
import { expect, test, type Page } from '@playwright/test';
import { addDog, blockMockFonts, createHousehold, newPerson, signIn } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

const ZONE = 'Africa/Johannesburg';
const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());

async function household(page: Page, baseURL: string, dogs: string[] = ['Rosie']) {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL);
	const added = [];
	for (const name of dogs) added.push(await addDog(page, baseURL, { name }));
	return added;
}

interface Log {
	id: string;
	etag: string;
	outcome: string;
}

async function logAdHoc(page: Page, baseURL: string, body: Record<string, unknown>) {
	const response = await page.request.post('/api/v1/session-logs', {
		headers: json(baseURL),
		data: JSON.stringify({ exerciseId: 'recall-basics', ...body })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as Log;
}

test('scenario 3: a planned session logged in under 30 seconds, then Done with its outcome', async ({
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
	const session = (await scheduled.json()) as { id: string };

	// FR-07's target, from opening the session to saved: one tap to open, the outcome, two
	// details, Save (J3 steps 3–4).
	const started = Date.now();
	await page.goto(`/sessions/${session.id}`);
	await page.getByRole('button', { name: 'Log practice' }).click();
	const sheet = page.getByRole('dialog', { name: 'Log practice' });
	await expect(sheet.getByText('Rosie')).toBeVisible();
	// Not assessed is chosen, so saving never claims success.
	await expect(sheet.getByRole('radio', { name: 'Not assessed' })).toBeChecked();
	await sheet.getByRole('radio', { name: 'Partially successful' }).check({ force: true });
	const details = sheet.getByRole('button', { name: 'Add details' });
	if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
	await sheet.getByRole('button', { name: 'Relaxed/confident' }).click();
	await sheet.getByRole('button', { name: 'Garden' }).click();
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('Logged. Recall basics is done.')).toBeVisible();
	const seconds = (Date.now() - started) / 1000;
	test.info().annotations.push({ type: 'quick log (planned)', description: `${seconds} s` });
	expect(seconds).toBeLessThan(30);

	await expect(page.getByText('Partially successful')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Log practice' })).toBeHidden();
	await page.getByRole('link', { name: 'See the log' }).click();
	await expect(page).toHaveURL(/\/logs\//);
	await expect(page.getByText('Relaxed/confident')).toBeVisible();
	await expect(page.getByText('Garden')).toBeVisible();

	// Plan shows the card as done, with how it went.
	await page.goto('/plan');
	const card = page.getByRole('link', { name: /Recall basics/ });
	await expect(card).toContainText('Done');
	await expect(card).toContainText('Partially successful');

	// It can't be logged twice.
	const again = await page.request.post('/api/v1/session-logs', {
		headers: json(baseURL!),
		data: JSON.stringify({ plannedSessionId: session.id })
	});
	expect(again.status()).toBe(409);
});

test('an ad-hoc log from the library, not assessed, after choosing the dog', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!, ['Rosie', 'Miso']);
	const started = Date.now();
	await page.goto('/library/recall-basics');
	await page.getByRole('button', { name: 'Log practice' }).click();
	const sheet = page.getByRole('dialog', { name: 'Log practice' });

	// With two dogs and All dogs showing, Save says which is missing (ui.md §5.1).
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText('Choose which dog practised.')).toBeVisible();
	await sheet.getByRole('radio', { name: 'Miso' }).click();
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('Logged Recall basics for Miso.')).toBeVisible();
	const seconds = (Date.now() - started) / 1000;
	test.info().annotations.push({ type: 'quick log (ad hoc)', description: `${seconds} s` });
	expect(seconds).toBeLessThan(30);

	await page.getByRole('link', { name: 'See the log' }).click();
	await expect(page.getByText('Not assessed')).toBeVisible();
	await expect(page.getByText('Miso', { exact: true })).toBeVisible();
});

test('a failed save keeps everything chosen and offers Retry (NFR-04)', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!);
	await page.goto('/library/recall-basics');
	await page.getByRole('button', { name: 'Log practice' }).click();
	const sheet = page.getByRole('dialog', { name: 'Log practice' });
	await sheet.getByRole('radio', { name: 'Successful', exact: true }).check({ force: true });
	const details = sheet.getByRole('button', { name: 'Add details' });
	if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
	await sheet.getByLabel(/Notes/).fill('Came straight back.');

	await page.route('**/api/v1/session-logs', (route) => route.abort('internetdisconnected'));
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText("Couldn't save — check your connection.")).toBeVisible();
	await expect(sheet.getByRole('radio', { name: 'Successful', exact: true })).toBeChecked();
	await expect(sheet.getByLabel(/Notes/)).toHaveValue('Came straight back.');

	await page.unroute('**/api/v1/session-logs');
	await sheet.getByRole('button', { name: 'Retry' }).click();
	await expect(sheet).toBeHidden();
	await page.getByRole('link', { name: 'See the log' }).click();
	await expect(page.getByText('Came straight back.')).toBeVisible();
	await expect(page.getByText('Successful', { exact: true })).toBeVisible();
});

test('editing a log, and a change made elsewhere meanwhile (NFR-13)', async ({ page, baseURL }) => {
	const [rosie] = await household(page, baseURL!);
	const log = await logAdHoc(page, baseURL!, { dogId: rosie!.id, durationMin: 5 });
	await page.goto(`/logs/${log.id}`);
	await expect(page.getByText('5 min')).toBeVisible();

	// Someone else saves first.
	const theirs = await page.request.patch(`/api/v1/session-logs/${log.id}`, {
		headers: { ...json(baseURL!), 'if-match': log.etag },
		data: JSON.stringify({ outcome: 'successful' })
	});
	expect(theirs.status()).toBe(200);

	await page.getByRole('button', { name: 'Edit' }).click();
	const sheet = page.getByRole('dialog', { name: 'Edit log' });
	await expect(sheet.getByRole('radio', { name: 'Not assessed' })).toBeChecked();
	await sheet.getByRole('radio', { name: 'Not yet successful' }).check({ force: true });
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText(/changed this a moment ago/)).toBeVisible();
	await sheet.getByRole('button', { name: 'See their version' }).click();
	await expect(sheet.getByRole('radio', { name: 'Successful', exact: true })).toBeChecked();

	await sheet.getByRole('radio', { name: 'Not yet successful' }).check({ force: true });
	await sheet.getByRole('button', { name: 'More minutes' }).click();
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('Saved.')).toBeVisible();
	await expect(page.getByText('Not yet successful')).toBeVisible();
	await expect(page.getByText('6 min')).toBeVisible();
});

test("another household can't read, change or log against a household's data (scenario 9)", async ({
	page,
	browser,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	const log = await logAdHoc(page, baseURL!, { dogId: rosie!.id });
	const scheduled = await page.request.post('/api/v1/planned-sessions', {
		headers: json(baseURL!),
		data: JSON.stringify({
			dogId: rosie!.id,
			exerciseId: 'recall-basics',
			date: today(),
			time: '23:55'
		})
	});
	const session = (await scheduled.json()) as { id: string };

	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const outsider = await context.newPage();
	await blockMockFonts(outsider);
	await household(outsider, baseURL!);
	const responses = await Promise.all([
		outsider.request.get(`/api/v1/session-logs/${log.id}`),
		outsider.request.patch(`/api/v1/session-logs/${log.id}`, {
			headers: { ...json(baseURL!), 'if-match': log.etag },
			data: JSON.stringify({ outcome: 'successful' })
		}),
		outsider.request.post('/api/v1/session-logs', {
			headers: json(baseURL!),
			data: JSON.stringify({ plannedSessionId: session.id })
		}),
		outsider.request.post('/api/v1/session-logs', {
			headers: json(baseURL!),
			data: JSON.stringify({ dogId: rosie!.id, exerciseId: 'recall-basics' })
		})
	]);
	expect(responses.map((r) => r.status())).toEqual([404, 404, 404, 400]);
	expect((await outsider.goto(`/logs/${log.id}`))?.status()).toBe(404);
	await expect(outsider.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that");

	// Untouched for its own household.
	const own = await (await page.request.get(`/api/v1/session-logs/${log.id}`)).json();
	expect(own).toMatchObject({ outcome: 'not_assessed', etag: log.etag });
	const planned = await (await page.request.get(`/api/v1/planned-sessions/${session.id}`)).json();
	expect(planned).toMatchObject({ status: 'planned' });
	await context.close();
});
