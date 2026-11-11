// The training planner (FR-05, NFR-13, scenarios 3 and 9; ui.md J3, §4.3). Each test brings its
// own household, in Johannesburg, so dates are worked out on its clocks.
import { expect, test, type Page } from '@playwright/test';
import { addDog, blockMockFonts, createHousehold, newPerson, signIn } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

const ZONE = 'Africa/Johannesburg';
const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });

/** A date on the household's clocks, `days` from today. */
function dateIn(days: number): string {
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
	return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const isoWeek = (date: string) => {
	const ms = Date.parse(`${date}T00:00:00Z`);
	const thursday = new Date(ms + (4 - weekday(date)) * 86_400_000);
	const year = thursday.getUTCFullYear();
	const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1;
	return `${year}-W${String(week).padStart(2, '0')}`;
};

async function household(page: Page, baseURL: string, dogs: string[] = ['Rosie']) {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL);
	const added = [];
	for (const name of dogs) added.push(await addDog(page, baseURL, { name }));
	return added;
}

interface Session {
	id: string;
	etag: string;
	date: string;
	time: string;
	status: string;
	plan?: { id: string; etag: string };
}

async function schedule(page: Page, baseURL: string, body: Record<string, unknown>) {
	const response = await page.request.post('/api/v1/planned-sessions', {
		headers: json(baseURL),
		data: JSON.stringify({ exerciseId: 'recall-basics', time: '17:30', ...body })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as Session;
}

async function sessionsOn(page: Page, from: string, to = from) {
	const response = await page.request.get(`/api/v1/planned-sessions?from=${from}&to=${to}`);
	expect(response.status()).toBe(200);
	return ((await response.json()) as { sessions: Session[] }).sessions;
}

test('scheduling a session from Plan, then skipping, cancelling and putting it back', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!, ['Rosie', 'Miso']);
	const tomorrow = dateIn(1);
	await page.goto(`/plan?week=${isoWeek(tomorrow)}&day=${tomorrow}`);
	await expect(page.getByRole('heading', { name: 'Nothing planned' })).toBeVisible();
	await page.getByRole('link', { name: 'Schedule' }).click();
	await expect(page).toHaveURL(`/plan/new?date=${tomorrow}`);

	// Nothing chosen: the button stays enabled and says what's missing (ui.md §5.1).
	await page.getByRole('button', { name: 'Schedule' }).click();
	await expect(page.getByText('Choose a dog.')).toBeVisible();
	await expect(page.getByText('Choose an exercise.')).toBeVisible();
	await expect(page.getByText('Choose a time.')).toBeVisible();

	await page.getByRole('radio', { name: 'Miso' }).check({ force: true });
	await page.getByRole('button', { name: /Exercise/ }).click();
	const picker = page.getByRole('dialog', { name: 'Choose an exercise' });
	await picker.getByRole('button', { name: 'Settling', exact: true }).click();
	await expect(picker.getByRole('button', { name: /Recall basics/ })).toBeHidden();
	await picker.getByLabel('Search exercises').fill('mat');
	await picker.getByRole('button', { name: /Settle on a mat/ }).click();
	await expect(picker).toBeHidden();
	await expect(page.getByRole('button', { name: /Exercise Settle on a mat/ })).toBeVisible();
	await page.getByLabel('Time').fill('07:02');
	await page.getByLabel('Time').blur();
	await expect(page.getByLabel('Time')).toHaveValue('07:00');
	await page.getByRole('button', { name: 'Schedule' }).click();

	await expect(page).toHaveURL(`/plan?week=${isoWeek(tomorrow)}&day=${tomorrow}`);
	await expect(
		page.getByText('Planned Settle on a mat for Miso, tomorrow at 07:00.')
	).toBeVisible();
	const card = page.getByRole('link', { name: /07:00 Settle on a mat Miso/ });
	await expect(card).toBeVisible();
	await expect(
		page.getByRole('link', {
			name: new RegExp(`${tomorrow.slice(8).replace(/^0/, '')}.*has sessions`)
		})
	).toBeVisible();

	await card.click();
	await expect(page.getByRole('heading', { name: 'Settle on a mat' })).toBeVisible();
	await expect(page.getByText('Tomorrow at 07:00')).toBeVisible();
	await page.getByRole('button', { name: 'Skip this session' }).click();
	await expect(page.getByText('Skipped. It won’t count as done.')).toBeVisible();
	await expect(page.getByText('Skipped · not counted as done')).toBeVisible();
	await page.getByRole('button', { name: 'Put it back in the plan' }).click();
	await expect(page.getByText('Put back in the plan.')).toBeVisible();

	await page.getByRole('button', { name: 'Cancel…' }).click();
	const sheet = page.getByRole('dialog', { name: /Cancel Settle on a mat tomorrow/ });
	await sheet.getByRole('button', { name: 'Cancel session' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('Cancelled · not counted as done')).toBeVisible();

	await page.getByRole('link', { name: 'Plan' }).first().click();
	await expect(
		page.getByRole('link', { name: /07:00 Settle on a mat Miso Cancelled/ })
	).toBeVisible();
});

test('the library’s Schedule button starts with that exercise', async ({ page, baseURL }) => {
	await household(page, baseURL!);
	await page.goto('/library/recall-basics');
	await page.getByRole('link', { name: 'Schedule' }).click();
	await expect(page).toHaveURL('/plan/new?exercise=recall-basics');
	await expect(page.getByRole('button', { name: /Exercise Recall basics/ })).toBeVisible();
	// One dog: it's simply named, nothing to pick.
	await expect(page.getByRole('group', { name: 'Dog' })).toContainText('Rosie');
	await expect(page.getByRole('group', { name: 'Dog' }).getByRole('radio')).toHaveCount(0);
});

test('a repeating plan: this and following, then cancelling the rest', async ({
	page,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	const start = dateIn(1);
	await page.goto('/plan/new');
	await page.getByRole('button', { name: /Exercise/ }).click();
	await page
		.getByRole('dialog', { name: 'Choose an exercise' })
		.getByRole('button', { name: /Recall basics/ })
		.click();
	await page.getByLabel('Date').fill(start);
	await page.getByLabel('Time').fill('17:30');
	await page.getByText('Daily', { exact: true }).click();
	await page.getByRole('button', { name: 'Schedule' }).click();
	await expect(
		page.getByText(/Planned Recall basics for Rosie, starting tomorrow at 17:30\./)
	).toBeVisible();
	await expect(page.getByRole('link', { name: /17:30 Recall basics Rosie Repeats/ })).toBeVisible();

	// Three weeks out exists already, and a week further out is made when it's looked at.
	expect(await sessionsOn(page, dateIn(21))).toHaveLength(1);
	const far = dateIn(40);
	await page.goto(`/plan?week=${isoWeek(far)}&day=${far}`);
	await expect(page.getByRole('link', { name: /17:30 Recall basics Rosie/ })).toBeVisible();

	// From the third session on, an hour later on weekdays only.
	const third = (await sessionsOn(page, dateIn(3)))[0]!;
	await page.goto(`/sessions/${third.id}`);
	await expect(page.getByText('Every day')).toBeVisible();
	await page.getByRole('button', { name: 'Change' }).click();
	await page.getByRole('link', { name: 'This and following' }).click();
	await expect(page.getByRole('heading', { name: 'Change this and following' })).toBeVisible();
	await page.getByLabel('Time').fill('18:30');
	await page.getByText('Weekdays', { exact: true }).click();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved this and the following sessions.')).toBeVisible();
	await expect(page.getByText('Weekdays')).toBeVisible();

	const before = await sessionsOn(page, dateIn(1), dateIn(2));
	expect(before.map((s) => s.time)).toEqual(['17:30', '17:30']);
	const after = await sessionsOn(page, dateIn(3), dateIn(9));
	expect(after.every((s) => s.time === '18:30' && weekday(s.date) <= 5)).toBe(true);
	expect(after).toHaveLength(5);

	// Moving one session leaves the rest of its plan alone.
	const moved = after[1]!;
	await page.goto(`/sessions/${moved.id}`);
	await page.getByRole('button', { name: 'Change' }).click();
	await page.getByRole('link', { name: 'This session only' }).click();
	await page.getByLabel('Time').fill('06:45');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
	await expect(page.getByText(/at 06:45/)).toBeVisible();
	expect((await sessionsOn(page, after[2]!.date))[0]!.time).toBe('18:30');

	// Cancel this and following from the next one: nothing of the plan is left after it.
	await page.goto(`/sessions/${after[2]!.id}`);
	await page.getByRole('button', { name: 'Cancel…' }).click();
	await page
		.getByRole('dialog', { name: 'Cancel Recall basics?' })
		.getByRole('button', { name: 'This and following' })
		.click();
	await expect(page).toHaveURL(new RegExp(`day=${after[2]!.date}`));
	await expect(page.getByText(/^Cancelled Recall basics from/)).toBeVisible();
	expect(await sessionsOn(page, after[2]!.date, dateIn(30))).toEqual([]);
	expect(await sessionsOn(page, moved.date)).toHaveLength(1);
	expect(rosie).toBeDefined();
});

test('a change made elsewhere is never overwritten', async ({ page, baseURL }) => {
	const [rosie] = await household(page, baseURL!);
	const session = await schedule(page, baseURL!, { dogId: rosie!.id, date: dateIn(2) });
	await page.goto(`/sessions/${session.id}/edit?scope=this`);
	// Another caregiver moves it meanwhile.
	const meanwhile = await page.request.patch(`/api/v1/planned-sessions/${session.id}`, {
		headers: { ...json(baseURL!), 'if-match': session.etag },
		data: JSON.stringify({ time: '09:00' })
	});
	expect(meanwhile.status()).toBe(200);
	await page.getByLabel('Time').fill('10:00');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(
		page.getByText('Test owner changed this a moment ago, so nothing was saved.')
	).toBeVisible();
	await page.getByRole('button', { name: 'See their version' }).click();
	await expect(page.getByLabel('Time')).toHaveValue('09:00');

	// Skipping a stale session reloads it and says so.
	await page.goto(`/sessions/${session.id}`);
	const latest = (await (
		await page.request.get(`/api/v1/planned-sessions/${session.id}`)
	).json()) as Session;
	await page.request.patch(`/api/v1/planned-sessions/${session.id}`, {
		headers: { ...json(baseURL!), 'if-match': latest.etag },
		data: JSON.stringify({ time: '09:30' })
	});
	await page.getByRole('button', { name: 'Skip this session' }).click();
	await expect(page.getByText(/changed this a moment ago, so it wasn't skipped/)).toBeVisible();
	await expect(page.getByText(/at 09:30/)).toBeVisible();
});

test("another household can't see or change a session by its ID (scenario 9)", async ({
	page,
	browser,
	baseURL
}) => {
	const [rosie] = await household(page, baseURL!);
	const session = await schedule(page, baseURL!, {
		dogId: rosie!.id,
		date: dateIn(1),
		repeat: { days: [1, 2, 3, 4, 5, 6, 7] }
	});
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const outsider = await context.newPage();
	await blockMockFonts(outsider);
	await household(outsider, baseURL!);
	const headers = { ...json(baseURL!), 'if-match': session.etag };
	const responses = await Promise.all([
		outsider.request.get(`/api/v1/planned-sessions/${session.id}`),
		outsider.request.patch(`/api/v1/planned-sessions/${session.id}`, {
			headers,
			data: JSON.stringify({ status: 'cancelled' })
		}),
		outsider.request.patch(`/api/v1/training-plans/${session.plan!.id}`, {
			headers: { ...headers, 'if-match': session.plan!.etag },
			data: JSON.stringify({ fromSessionId: session.id, time: '06:00' })
		}),
		outsider.request.post(`/api/v1/training-plans/${session.plan!.id}/end`, {
			headers: { ...headers, 'if-match': session.plan!.etag },
			data: JSON.stringify({ fromSessionId: session.id })
		})
	]);
	expect(responses.map((r) => r.status())).toEqual([404, 404, 404, 404]);
	expect(await sessionsOn(outsider, dateIn(1), dateIn(7))).toEqual([]);
	// Nor schedule for another household's dog.
	const theirDog = await outsider.request.post('/api/v1/planned-sessions', {
		headers: json(baseURL!),
		data: JSON.stringify({
			dogId: rosie!.id,
			exerciseId: 'recall-basics',
			date: dateIn(1),
			time: '07:00'
		})
	});
	expect(theirDog.status()).toBe(400);
	await outsider.goto(`/sessions/${session.id}`);
	await expect(outsider.getByRole('heading', { name: "We couldn't find that" })).toBeVisible();
	await context.close();

	expect((await sessionsOn(page, dateIn(1)))[0]).toMatchObject({
		status: 'planned',
		time: '17:30'
	});
});
