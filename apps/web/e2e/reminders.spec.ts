// Push reminders (FR-12, NFR-16, scenarios 4 and 5; ui.md J7). The browser's PushManager is
// faked, since headless Chromium can't reach a real push service, but the service worker, the
// server, the tick and the encryption are real: reminders go to a stand-in push service and are
// decrypted here as a phone would. Each test brings its own household, in Johannesburg.
import { expect, test, type Page } from '@playwright/test';
import { addDog, blockMockFonts, createHousehold, newPerson, signIn } from './mock-sign-in.js';
import { fakePushInBrowser, fakeSubscription, pushesFor } from './push-service.js';
import { runTick } from './tick.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

const ZONE = 'Africa/Johannesburg';
const FIVE_MIN = 5 * 60_000;
const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });
const onClock = (instant: Date) => {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: ZONE,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(instant)
			.map((p) => [p.type, p.value])
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: `${parts.hour}:${parts.minute}`
	};
};

/**
 * The next 5-minute mark that's at least a few seconds away and less than an interval ahead, so
 * a tick run now sends its reminder, and the session is made before its time (architecture §6.3).
 */
async function nextMark(): Promise<Date> {
	let now = Date.now();
	let mark = Math.ceil((now + 3_000) / FIVE_MIN) * FIVE_MIN;
	if (mark - now > FIVE_MIN - 10_000) {
		await new Promise((r) => setTimeout(r, mark - now - (FIVE_MIN - 10_000)));
		now = Date.now();
		mark = Math.ceil((now + 3_000) / FIVE_MIN) * FIVE_MIN;
	}
	return new Date(mark);
}

async function household(page: Page, baseURL: string) {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL);
	return addDog(page, baseURL, { name: 'Ripley' });
}

async function schedule(page: Page, baseURL: string, dogId: string, at: Date) {
	const response = await page.request.post('/api/v1/planned-sessions', {
		headers: json(baseURL),
		data: JSON.stringify({ dogId, exerciseId: 'recall-basics', ...onClock(at) })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as { id: string; etag: string; time: string };
}

/** Turns reminders on through the Notifications screen, as a person would. */
async function turnOn(page: Page) {
	await page.goto('/settings/notifications');
	await page.getByRole('switch', { name: /Push notifications/ }).click();
	await expect(page.getByRole('switch', { name: /Push notifications/ })).toBeChecked();
	await expect(page.getByText(/On for this device \(.+ · Chrome\)/)).toBeVisible();
	const settings = await (await page.request.get('/api/v1/reminders')).json();
	expect(settings.devices).toHaveLength(1);
	return settings.devices[0].id as string;
}

test('scenario 4: turn on reminders, and one arrives for a planned session with the app closed', async ({
	page,
	baseURL
}) => {
	const dog = await household(page, baseURL!);
	const sub = fakeSubscription();
	await fakePushInBrowser(page, sub);
	await page.goto('/more');
	await page.getByRole('link', { name: /Notifications/ }).click();
	await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
	await turnOn(page);

	const session = await schedule(page, baseURL!, dog.id, await nextMark());
	// The app isn't needed: the tick is the server's alone.
	await page.goto('about:blank');
	await runTick(page);

	const [push, ...more] = await pushesFor(sub);
	expect(more).toEqual([]);
	expect(push!.headers).toMatchObject({
		ttl: '3600',
		urgency: 'high',
		'content-encoding': 'aes128gcm'
	});
	expect(push!.payload).toEqual({
		reminderId: expect.any(String),
		kind: 'training',
		title: 'Training time: Recall basics',
		body: `Ripley · ${session.time}`,
		path: `sessions/${session.id}`,
		tag: `session-${session.id}`
	});

	// A second tick, or the next, doesn't send it again.
	await runTick(page);
	expect(await pushesFor(sub)).toHaveLength(1);
});

test('scenario 5: a session moved or cancelled before its time sends no stale reminder', async ({
	page,
	baseURL
}) => {
	const dog = await household(page, baseURL!);
	const sub = fakeSubscription();
	await fakePushInBrowser(page, sub);
	await turnOn(page);

	const mark = await nextMark();
	const moved = await schedule(page, baseURL!, dog.id, mark);
	const cancelled = await schedule(page, baseURL!, dog.id, mark);
	const later = onClock(new Date(mark.getTime() + 60 * 60_000));
	expect(
		(
			await page.request.patch(`/api/v1/planned-sessions/${moved.id}`, {
				headers: { ...json(baseURL!), 'if-match': moved.etag },
				data: JSON.stringify({ date: later.date, time: later.time })
			})
		).status()
	).toBe(200);
	expect(
		(
			await page.request.patch(`/api/v1/planned-sessions/${cancelled.id}`, {
				headers: { ...json(baseURL!), 'if-match': cancelled.etag },
				data: JSON.stringify({ status: 'cancelled' })
			})
		).status()
	).toBe(200);

	await runTick(page);
	expect(await pushesFor(sub)).toEqual([]);

	// Tapping an old notification for the cancelled one lands on a page that says so.
	await page.goto(`/sessions/${cancelled.id}`);
	await expect(page.getByText('This session was cancelled.')).toBeVisible();
	await page.getByRole('link', { name: 'Go to Today' }).click();
	await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

test('lead time and turning training reminders off are saved, and say so', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!);
	const sub = fakeSubscription();
	await fakePushInBrowser(page, sub);
	await turnOn(page);

	await page.getByLabel('Remind me').selectOption({ label: '15 minutes before' });
	await expect(page.getByText('Saved.')).toBeVisible();
	await page.getByRole('switch', { name: 'Training sessions' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
	const settings = await (await page.request.get('/api/v1/reminders')).json();
	expect(settings.preference).toEqual({ training: false, trainingLeadMin: 15 });
	await expect(page.getByLabel('Remind me')).toBeDisabled();
});

test('the delayed test: due in 3 minutes, and the service worker reports its arrival', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!);
	const sub = fakeSubscription();
	await fakePushInBrowser(page, sub);
	await turnOn(page);

	// The test lives under the folded tips.
	await expect(page.getByRole('button', { name: 'Test reminders' })).toBeHidden();
	await page.getByText('Reminder tips').click();
	const asked = Date.now();
	await page.getByRole('button', { name: 'Test reminders' }).click();
	await expect(page.getByText(/On its way\. Lock the screen and leave the device/)).toBeVisible();
	const { test: started } = await (await page.request.get('/api/v1/reminders')).json();
	expect(Date.parse(started.dueAt) - asked).toBeGreaterThanOrEqual(3 * 60_000 - 2_000);
	// Not sent early: it has to find the phone locked.
	await runTick(page);
	expect(await pushesFor(sub)).toEqual([]);

	// Deliver it to the real service worker as the push service would, then tap through.
	const cdp = await page.context().newCDPSession(page);
	const registrationId = await new Promise<string>((resolve) => {
		cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
			const live = registrations.find((r: { isDeleted: boolean }) => !r.isDeleted);
			if (live) resolve(live.registrationId);
		});
		void cdp.send('ServiceWorker.enable');
	});
	await cdp.send('ServiceWorker.deliverPushMessage', {
		origin: new URL(baseURL!).origin,
		registrationId,
		data: JSON.stringify({
			reminderId: started.id,
			kind: 'test',
			title: 'Reminders are working',
			body: 'Tap to tell Toe Beans this one arrived.',
			path: 'settings/notifications?test=arrived',
			tag: 'test'
		})
	});
	await expect
		.poll(async () => (await (await page.request.get('/api/v1/reminders')).json()).test.receivedAt)
		.toBeTruthy();

	await page.goto('/settings/notifications?test=arrived');
	await expect(page.getByText('Reminders are working on this device.')).toBeVisible();
	await expect(page.getByText(/The last test arrived at/)).toBeVisible();
});

test('a device the push service says is gone stops getting reminders', async ({
	page,
	baseURL
}) => {
	const dog = await household(page, baseURL!);
	const sub = fakeSubscription('gone-');
	await fakePushInBrowser(page, sub);
	await turnOn(page);
	await schedule(page, baseURL!, dog.id, await nextMark());
	await runTick(page);

	const { devices } = await (await page.request.get('/api/v1/reminders')).json();
	expect(devices).toMatchObject([{ disabled: true }]);
});

test('blocked, unsupported and failed states say what to do', async ({ page, baseURL }) => {
	await household(page, baseURL!);

	await fakePushInBrowser(page, fakeSubscription(), 'denied');
	await page.goto('/settings/notifications');
	await expect(page.getByText('Notifications are blocked for Toe Beans')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();

	const failing = await page.context().newPage();
	await fakePushInBrowser(failing, null);
	await failing.goto('/settings/notifications');
	await failing.getByRole('switch', { name: /Push notifications/ }).click();
	await expect(failing.getByText("Couldn't register this device")).toBeVisible();
	await expect(failing.getByRole('button', { name: 'Retry' })).toBeVisible();

	const old = await page.context().newPage();
	await old.addInitScript(() => {
		delete (window as { PushManager?: unknown }).PushManager;
	});
	await old.goto('/settings/notifications');
	await expect(old.getByText(/This browser can't show notifications\./)).toBeVisible();
	await expect(old.getByRole('switch', { name: /Push notifications/ })).toBeDisabled();
});

test('the switch turns this device off, and other devices can be removed', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!);
	const other = fakeSubscription();
	const saved = await page.request.put('/api/v1/reminders/devices', {
		headers: json(baseURL!),
		data: JSON.stringify({
			endpoint: other.endpoint,
			keys: { p256dh: other.p256dh, auth: other.auth },
			label: 'Old tablet · Chrome'
		})
	});
	expect(saved.status()).toBe(200);
	const sub = fakeSubscription();
	await fakePushInBrowser(page, sub);
	await page.goto('/settings/notifications');
	await page.getByRole('switch', { name: /Push notifications/ }).click();
	await expect(page.getByText(/On for this device/)).toBeVisible();

	await page.getByRole('button', { name: 'Remove Old tablet · Chrome' }).click();
	await expect(page.getByRole('heading', { name: 'Remove Old tablet · Chrome?' })).toBeVisible();
	await page.getByRole('button', { name: 'Remove device' }).click();
	await expect(page.getByText('Your other devices')).toHaveCount(0);

	await page.getByRole('switch', { name: /Push notifications/ }).click();
	await expect(page.getByText('Off on this device')).toBeVisible();
	await expect(page.getByRole('switch', { name: /Push notifications/ })).not.toBeChecked();
	await expect(page.getByText('What to remind you of')).toHaveCount(0);
	const { devices } = await (await page.request.get('/api/v1/reminders')).json();
	expect(devices).toEqual([]);
});

test('scenario 9: devices and reminders are only ever the person’s own', async ({
	page,
	baseURL,
	browser
}) => {
	await household(page, baseURL!);
	const sub = fakeSubscription();
	await fakePushInBrowser(page, sub);
	const deviceId = await turnOn(page);
	await page.getByText('Reminder tips').click();
	await page.getByRole('button', { name: 'Test reminders' }).click();
	await expect(page.getByText(/On its way/)).toBeVisible();
	const { test: started } = await (await page.request.get('/api/v1/reminders')).json();

	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const outsider = await context.newPage();
	await blockMockFonts(outsider);
	await signIn(outsider, newPerson('outsider'));
	await createHousehold(outsider, baseURL!);
	const headers = json(baseURL!);
	const answers = await Promise.all([
		outsider.request.delete(`/api/v1/reminders/devices/${deviceId}`, { headers }),
		outsider.request.post(`/api/v1/reminders/${started.id}/received`, { headers }),
		outsider.request.post('/api/v1/reminders/test', {
			headers,
			data: JSON.stringify({ deviceId })
		})
	]);
	expect(answers.map((a) => a.status())).toEqual([404, 404, 404]);
	const theirs = await (await outsider.request.get('/api/v1/reminders')).json();
	expect(theirs).toMatchObject({ devices: [], test: null });
	await context.close();

	const mine = await (await page.request.get('/api/v1/reminders')).json();
	expect(mine.devices).toHaveLength(1);
});

test('the tick refuses anyone without its secret', async ({ request }) => {
	expect((await request.post('/internal/tick')).status()).toBe(401);
	expect(
		(await request.post('/internal/tick', { headers: { authorization: 'Bearer nope' } })).status()
	).toBe(401);
});

test('Today offers reminders until they’re turned on or dismissed', async ({ page, baseURL }) => {
	await household(page, baseURL!);
	await fakePushInBrowser(page, fakeSubscription());
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Turn on training reminders' })).toBeVisible();
	await page.getByRole('button', { name: 'Not now' }).click();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Turn on training reminders' })).toHaveCount(0);
});
