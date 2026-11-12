import { describe, expect, it } from 'vitest';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { PUSH_SERVICES } from '../../domain/reminders.js';
import { manualClock } from '../../testing/clock.js';
import {
	fakePushSender,
	memoryPushDevices,
	memoryReminderPreferences,
	memoryReminders
} from '../../testing/reminders.js';
import type { MemberContext } from '../auth/auth.js';
import { createReminderSettings } from './reminders.js';

const start = new Date('2026-11-10T15:00:00Z');
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const sam: MemberContext = { userId: 'sam' as Id, householdId: 'h1' as Id, role: 'owner' };
const alex: MemberContext = { userId: 'alex' as Id, householdId: 'h1' as Id, role: 'caregiver' };
const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

function setup() {
	const clock = manualClock(start);
	const now = () => clock.now();
	const ports = {
		pushDevices: memoryPushDevices(now),
		reminderPreferences: memoryReminderPreferences(),
		reminders: memoryReminders(now),
		push: fakePushSender(),
		clock,
		ids: createIdGenerator(() => now().getTime()),
		logger: silent
	};
	const settings = createReminderSettings(ports, { allowedEndpoints: PUSH_SERVICES });
	const save = async (ctx: MemberContext, name: string) => {
		const saved = await settings.saveDevice(ctx, { endpoint: endpoint(name), keys, label: name });
		if (!saved.ok) throw new Error(JSON.stringify(saved.error));
		return saved.value;
	};
	return { clock, ports, settings, save };
}

describe('devices', () => {
	it('are saved once per browser, and follow whoever subscribed it last', async () => {
		const { settings, save } = setup();
		const first = await save(sam, 'phone');
		const again = await save(sam, 'phone');
		expect(again.id).toBe(first.id);
		expect(await settings.devices(sam)).toHaveLength(1);

		const handedOver = await save(alex, 'phone');
		expect(handedOver.id).toBe(first.id);
		expect(await settings.devices(sam)).toEqual([]);
		expect(await settings.devices(alex)).toMatchObject([{ id: first.id, label: 'phone' }]);
	});

	it('come back to life when saved again after the push service dropped them', async () => {
		const { settings, save, ports } = setup();
		const device = await save(sam, 'phone');
		await ports.pushDevices.disable(device.id, start);
		expect((await settings.devices(sam))[0]!.disabledAt).toBeDefined();
		await save(sam, 'phone');
		expect((await settings.devices(sam))[0]!.disabledAt).toBeUndefined();
	});

	it('must use a known push service, so the server never posts where a client says', async () => {
		const { settings } = setup();
		const saved = await settings.saveDevice(sam, {
			endpoint: 'http://169.254.169.254/latest/meta-data',
			keys
		});
		expect(saved).toMatchObject({ ok: false, error: { kind: 'validation' } });
	});

	it('must carry real keys', async () => {
		const { settings } = setup();
		const saved = await settings.saveDevice(sam, {
			endpoint: endpoint('x'),
			keys: { p256dh: 'short', auth: 'short' }
		});
		expect(saved).toMatchObject({ ok: false, error: { kind: 'validation' } });
	});

	it('are limited to ten a person', async () => {
		const { settings, save } = setup();
		for (let i = 0; i < 10; i++) await save(sam, `d${i}`);
		const eleventh = await settings.saveDevice(sam, { endpoint: endpoint('d10'), keys });
		expect(eleventh).toMatchObject({ ok: false, error: { kind: 'validation' } });
		expect((await settings.saveDevice(sam, { endpoint: endpoint('d3'), keys })).ok).toBe(true);
	});

	it("can be removed by their owner only; someone else's is not found", async () => {
		const { settings, save } = setup();
		const device = await save(sam, 'phone');
		expect(await settings.removeDevice(alex, device.id)).toMatchObject({
			ok: false,
			error: { kind: 'not-found' }
		});
		expect(await settings.removeDevice(sam, 'nonsense')).toMatchObject({ ok: false });
		expect((await settings.removeDevice(sam, device.id)).ok).toBe(true);
		expect(await settings.devices(sam)).toEqual([]);
	});
});

describe('preferences', () => {
	it('default to training reminders at the session time', async () => {
		const { settings } = setup();
		expect(await settings.preference(sam)).toEqual({
			userId: 'sam',
			training: true,
			trainingLeadMin: 0
		});
	});

	it('change one field at a time, and take only the lead times offered', async () => {
		const { settings } = setup();
		expect(await settings.savePreference(sam, { trainingLeadMin: 15 })).toMatchObject({
			ok: true,
			value: { training: true, trainingLeadMin: 15 }
		});
		expect(await settings.savePreference(sam, { training: false })).toMatchObject({
			ok: true,
			value: { training: false, trainingLeadMin: 15 }
		});
		expect(await settings.savePreference(sam, { trainingLeadMin: 7 })).toMatchObject({
			ok: false,
			error: { fields: { trainingLeadMin: expect.any(Array) } }
		});
		expect(await settings.preference(alex)).toMatchObject({ trainingLeadMin: 0 });
	});
});

describe('the test reminder', () => {
	it('is due 3 minutes later, on that device only', async () => {
		const { settings, save } = setup();
		const device = await save(sam, 'phone');
		const test = await settings.startTest(sam, { deviceId: device.id });
		expect(test).toMatchObject({
			ok: true,
			value: {
				overdue: false,
				reminder: {
					kind: 'test',
					status: 'pending',
					deviceId: device.id,
					dueAt: new Date('2026-11-10T15:03:00Z'),
					notBefore: new Date('2026-11-10T15:03:00Z')
				}
			}
		});
	});

	it("isn't started twice while one is on its way", async () => {
		const { settings, save, ports } = setup();
		const device = await save(sam, 'phone');
		const first = await settings.startTest(sam, { deviceId: device.id });
		const second = await settings.startTest(sam, { deviceId: device.id });
		expect(first.ok && second.ok && second.value.reminder.id).toBe(
			first.ok && first.value.reminder.id
		);
		expect(ports.reminders.all()).toHaveLength(1);
	});

	it("needs one of the person's own live devices", async () => {
		const { settings, save, ports } = setup();
		const device = await save(sam, 'phone');
		expect(await settings.startTest(alex, { deviceId: device.id })).toMatchObject({ ok: false });
		await ports.pushDevices.disable(device.id, start);
		expect(await settings.startTest(sam, { deviceId: device.id })).toMatchObject({ ok: false });
	});

	it('says it may not have arrived 10 minutes after it was due, until the phone reports it', async () => {
		const { settings, save, clock } = setup();
		const device = await save(sam, 'phone');
		const started = await settings.startTest(sam, { deviceId: device.id });
		const id = started.ok ? started.value.reminder.id : '';
		clock.set('2026-11-10T15:13:00Z');
		expect(await settings.latestTest(sam)).toMatchObject({ overdue: false });
		clock.set('2026-11-10T15:13:01Z');
		expect(await settings.latestTest(sam)).toMatchObject({ overdue: true });

		expect(await settings.received(alex, id)).toMatchObject({ ok: false });
		expect((await settings.received(sam, id)).ok).toBe(true);
		expect(await settings.latestTest(sam)).toMatchObject({
			overdue: false,
			reminder: { receivedAt: new Date('2026-11-10T15:13:01Z') }
		});
		expect(await settings.latestTest(alex)).toBeNull();
	});
});
