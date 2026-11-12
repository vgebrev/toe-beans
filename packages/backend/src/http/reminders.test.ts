import { describe, expect, it } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { createReminderSettings } from '../application/reminders/reminders.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { PUSH_SERVICES } from '../domain/reminders.js';
import { manualClock } from '../testing/clock.js';
import {
	fakePushSender,
	memoryPushDevices,
	memoryReminderPreferences,
	memoryReminders
} from '../testing/reminders.js';
import { createRemindersHttp } from './reminders.js';
import { createWorkerHttp } from './tick.js';

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const at = new Date('2026-11-10T15:00:00Z');
const noHousehold: Viewer = {
	auth: { userId: 'u' as Id },
	displayName: 'Sam',
	email: 'sam@example.com',
	member: null
};
const viewer: MemberViewer = {
	...noHousehold,
	member: {
		userId: 'u' as Id,
		householdId: 'h1' as Id,
		role: 'caregiver',
		householdName: 'The Does',
		timeZone: 'UTC'
	}
};
const subscription = {
	endpoint: 'https://fcm.googleapis.com/fcm/send/secret-token',
	expirationTime: null,
	keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) }
};

function setup() {
	const clock = manualClock(at);
	const now = () => clock.now();
	const http = createRemindersHttp(
		createReminderSettings(
			{
				pushDevices: memoryPushDevices(now),
				reminderPreferences: memoryReminderPreferences(),
				reminders: memoryReminders(now),
				push: fakePushSender(),
				clock,
				ids: createIdGenerator(() => now().getTime()),
				logger: silent
			},
			{ allowedEndpoints: PUSH_SERVICES }
		)
	);
	return { http, clock };
}

describe('reminders http', () => {
	it('answers the settings screen in one call', async () => {
		const { http } = setup();
		const res = await http.settings(viewer);
		expect(res).toMatchObject({
			status: 200,
			headers: { 'cache-control': 'no-store' },
			body: {
				publicKey: 'BPublicKeyForTests',
				preference: { training: true, trainingLeadMin: 0 },
				devices: [],
				test: null
			}
		});
	});

	it('saves the browser’s subscription and never gives the endpoint or keys back', async () => {
		const { http } = setup();
		const saved = await http.saveDevice(viewer, {
			body: { ...subscription, label: 'Galaxy S23 FE · Chrome' }
		});
		expect(saved.status).toBe(200);
		expect(saved.body).toEqual({
			id: expect.any(String),
			label: 'Galaxy S23 FE · Chrome',
			createdAt: at.toISOString(),
			disabled: false
		});
		const settings = await http.settings(viewer);
		expect(JSON.stringify(settings.body)).not.toContain('secret-token');
		expect(JSON.stringify(settings.body)).not.toContain('B'.repeat(87));
	});

	it('refuses a body that isn’t a subscription', async () => {
		const { http } = setup();
		expect((await http.saveDevice(viewer, { body: { endpoint: 5 } })).status).toBe(400);
	});

	it('removes a device, and 404s one that isn’t theirs', async () => {
		const { http } = setup();
		const saved = (await http.saveDevice(viewer, { body: subscription })).body as { id: string };
		expect((await http.removeDevice(viewer, { id: 'other' })).status).toBe(404);
		expect((await http.removeDevice(viewer, { id: saved.id })).status).toBe(204);
	});

	it('saves the preference, refusing unknown fields and lead times', async () => {
		const { http } = setup();
		expect(await http.savePreference(viewer, { body: { trainingLeadMin: 30 } })).toMatchObject({
			status: 200,
			body: { training: true, trainingLeadMin: 30 }
		});
		expect((await http.savePreference(viewer, { body: { trainingLeadMin: 20 } })).status).toBe(400);
		expect((await http.savePreference(viewer, { body: { careLeadDays: 1 } })).status).toBe(400);
	});

	it('starts a test and reports its arrival', async () => {
		const { http } = setup();
		const device = (await http.saveDevice(viewer, { body: subscription })).body as { id: string };
		const started = await http.startTest(viewer, { body: { deviceId: device.id } });
		expect(started).toMatchObject({
			status: 201,
			body: { deviceId: device.id, status: 'pending', dueAt: '2026-11-10T15:03:00.000Z' }
		});
		const id = (started.body as { id: string }).id;
		expect((await http.received(viewer, { id })).status).toBe(204);
		expect((await http.received(viewer, { id: 'nonsense' })).status).toBe(404);
		expect((await http.settings(viewer)).body).toMatchObject({
			test: { id, receivedAt: at.toISOString(), overdue: false }
		});
	});

	it('gives someone with no household a 404 everywhere', async () => {
		const { http } = setup();
		for (const res of [
			await http.settings(noHousehold),
			await http.saveDevice(noHousehold, { body: subscription }),
			await http.removeDevice(noHousehold, { id: 'x' }),
			await http.savePreference(noHousehold, { body: {} }),
			await http.startTest(noHousehold, { body: { deviceId: 'x' } }),
			await http.received(noHousehold, { id: 'x' })
		]) {
			expect(res.status).toBe(404);
		}
	});
});

describe('tick http', () => {
	const report = { extended: 0, claimed: 1, sent: 1, retrying: 0, skipped: 0, failed: 0 };
	const worker = { tick: async () => report };
	const auth = { verify: async (h: string | null) => h === 'Bearer good' };

	it('runs the tick for its scheduler', async () => {
		const http = createWorkerHttp(worker, { auth, logger: silent });
		expect(
			await http.tick({ authorization: 'Bearer good', scheduledAt: '2026-11-10T15:00:00Z' })
		).toMatchObject({ status: 200, body: report });
	});

	it('refuses anyone else, saying nothing', async () => {
		const http = createWorkerHttp(worker, { auth, logger: silent });
		const res = await http.tick({ authorization: 'Bearer bad', scheduledAt: null });
		expect(res.status).toBe(401);
		expect(res.body).toBeUndefined();
	});
});
