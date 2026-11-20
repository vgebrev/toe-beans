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
import { silentLogger } from '../../testing/logger.js';

const start = new Date('2026-11-10T15:00:00Z');
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
		logger: silentLogger
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

	it("won't move someone else's device without its keys (security audit F6)", async () => {
		const { settings, save } = setup();
		const phone = await save(sam, 'phone');
		const otherKeys = { p256dh: 'C'.repeat(87), auth: 'c'.repeat(22) };
		const taken = await settings.saveDevice(alex, {
			endpoint: endpoint('phone'),
			keys: otherKeys,
			label: 'phone'
		});
		expect(taken).toMatchObject({ ok: false, error: { kind: 'validation' } });
		expect(await settings.devices(sam)).toMatchObject([{ id: phone.id, keys }]);
		expect(await settings.devices(alex)).toEqual([]);
	});

	it('come back to life when saved again after the push service dropped them', async () => {
		const { settings, save, ports } = setup();
		const device = await save(sam, 'phone');
		await ports.pushDevices.disable(device.id, start);
		expect((await settings.devices(sam))[0]!.disabledAt).toBeDefined();
		await save(sam, 'phone');
		expect((await settings.devices(sam))[0]!.disabledAt).toBeUndefined();
	});

	it('replace their own stopped record when the same device subscribes anew', async () => {
		const { settings, save, ports } = setup();
		const phone = await save(sam, 'phone');
		const tablet = await save(sam, 'tablet');
		await ports.pushDevices.disable(phone.id, start);
		await ports.pushDevices.disable(tablet.id, start);
		const alexs = await save(alex, 'phone-old');
		await ports.pushDevices.disable(alexs.id, start);

		// A new subscription (new endpoint) with the same label: the stopped phone goes.
		const renewed = await settings.saveDevice(sam, {
			endpoint: endpoint('phone-renewed'),
			keys,
			label: 'phone'
		});
		expect(renewed.ok).toBe(true);
		expect((await settings.devices(sam)).map((d) => d.label).sort()).toEqual(['phone', 'tablet']);
		expect(
			(await settings.devices(sam)).find((d) => d.label === 'phone')!.disabledAt
		).toBeUndefined();
		// Someone else's stopped device is never touched.
		expect(await settings.devices(alex)).toHaveLength(1);
	});

	it('replace the same-named device used most recently when reinstalled (D43)', async () => {
		const { settings, clock, ports } = setup();
		const saveAs = async (name: string, label: string) => {
			const saved = await settings.saveDevice(sam, { endpoint: endpoint(name), keys, label });
			if (!saved.ok) throw new Error(JSON.stringify(saved.error));
			return saved.value;
		};
		const older = await saveAs('phone-1', 'phone');
		clock.advance(60_000);
		const newer = await saveAs('phone-2', 'phone');
		// phone-2 replaced phone-1 on saving; bring phone-1 back as a second phone of that name.
		await ports.pushDevices.save({ ...older, keys });
		clock.advance(60_000);
		await ports.pushDevices.recordSuccess(older.id, clock.now());
		const tablet = await saveAs('tablet', 'tablet');

		const reinstalled = await saveAs('phone-3', 'phone');
		const left = await settings.devices(sam);
		// phone-1 took a reminder after phone-2 was last seen, so it's the one in use.
		expect(left.map((d) => d.id).sort()).toEqual([newer.id, tablet.id, reinstalled.id].sort());
	});

	it('are marked in use when the app opens, never replacing another in use (D43)', async () => {
		const { settings, clock, save } = setup();
		const phone = await save(sam, 'phone');
		clock.advance(24 * 60 * 60 * 1000);
		const seen = await settings.deviceSeen(sam, {
			endpoint: endpoint('phone'),
			keys,
			label: 'phone',
			serverKey: 'BPublicKeyForTests'
		});
		expect(seen).toMatchObject({ ok: true, value: { id: phone.id, lastSeenAt: clock.now() } });
		const [device] = await settings.devices(sam);
		expect(device!.staleAt).toEqual(new Date(clock.now().getTime() + 30 * 24 * 60 * 60 * 1000));

		// A second phone of the same name opening the app is added alongside, not in place of it.
		const twin = await settings.deviceSeen(sam, {
			endpoint: endpoint('twin'),
			keys,
			label: 'phone',
			serverKey: 'BPublicKeyForTests'
		});
		expect(twin.ok).toBe(true);
		expect(await settings.devices(sam)).toHaveLength(2);
	});

	it('resume when their person signs in there again, but never pass to the next person (D43)', async () => {
		const { settings, ports, save } = setup();
		const phone = await save(sam, 'phone');
		await ports.pushDevices.signOut(sam.userId, endpoint('phone'), start);
		expect(await ports.pushDevices.listLive([sam.userId])).toEqual([]);
		expect(await settings.startTest(sam, { deviceId: phone.id })).toMatchObject({ ok: false });
		const opened = { endpoint: endpoint('phone'), keys, label: 'phone' };
		const serverKey = 'BPublicKeyForTests';

		// Alex signs in on Sam's phone: Sam's device stays Sam's, and stays signed out.
		expect(await settings.deviceSeen(alex, { ...opened, serverKey })).toEqual({
			ok: true,
			value: null
		});
		expect(await settings.devices(alex)).toEqual([]);
		expect((await settings.devices(sam))[0]!.signedOutAt).toBeDefined();

		// Sam signs in again: it resumes.
		expect(await settings.deviceSeen(sam, { ...opened, serverKey })).toMatchObject({
			ok: true,
			value: { id: phone.id }
		});
		expect((await settings.devices(sam))[0]!.signedOutAt).toBeUndefined();
		expect(await ports.pushDevices.listLive([sam.userId])).toHaveLength(1);

		// Alex turning reminders on there takes it over, as the browser's keys show it's theirs.
		await ports.pushDevices.signOut(sam.userId, endpoint('phone'), start);
		expect((await settings.saveDevice(alex, opened)).ok).toBe(true);
		expect(await settings.devices(sam)).toEqual([]);
		expect(await ports.pushDevices.listLive([alex.userId])).toHaveLength(1);
	});

	it('are left alone when the app opens with a subscription made with another key', async () => {
		const { settings } = setup();
		const seen = await settings.deviceSeen(sam, {
			endpoint: endpoint('phone'),
			keys,
			serverKey: 'BAnOldKey'
		});
		expect(seen).toEqual({ ok: true, value: null });
		expect(await settings.devices(sam)).toEqual([]);
	});

	it('replace exactly the subscription they renew, keeping its name (D43)', async () => {
		const { settings, clock, save } = setup();
		const phone = await save(sam, 'phone');
		clock.advance(60_000);
		const twin = await settings.deviceSeen(sam, {
			endpoint: endpoint('twin'),
			keys,
			label: 'phone',
			serverKey: 'BPublicKeyForTests'
		});
		expect(twin.ok).toBe(true);
		// The service worker knows the old endpoint but not the device's name.
		const renewed = await settings.saveDevice(sam, {
			endpoint: endpoint('phone-renewed'),
			keys,
			replaces: endpoint('phone')
		});
		expect(renewed).toMatchObject({ ok: true, value: { label: 'phone' } });
		const left = await settings.devices(sam);
		expect(left.map((d) => d.endpoint).sort()).toEqual(
			[endpoint('phone-renewed'), endpoint('twin')].sort()
		);
		expect(left.some((d) => d.id === phone.id)).toBe(false);
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
		const { settings, save, ports } = setup();
		const devices = [];
		for (let i = 0; i < 10; i++) devices.push(await save(sam, `d${i}`));
		const eleventh = await settings.saveDevice(sam, { endpoint: endpoint('d10'), keys });
		expect(eleventh).toMatchObject({ ok: false, error: { kind: 'validation' } });
		expect((await settings.saveDevice(sam, { endpoint: endpoint('d3'), keys })).ok).toBe(true);
		// A stopped device coming back on a new subscription replaces itself, so it still fits.
		await ports.pushDevices.disable(devices[4]!.id, start);
		const back = await settings.saveDevice(sam, {
			endpoint: endpoint('d4-new'),
			keys,
			label: 'd4'
		});
		expect(back.ok).toBe(true);
		expect(await settings.devices(sam)).toHaveLength(10);
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
	it('default to training reminders at the session time, and care at 08:00 on the day', async () => {
		const { settings } = setup();
		expect(await settings.preference(sam)).toEqual({
			userId: 'sam',
			training: true,
			trainingLeadMin: 0,
			care: true,
			careLeadDays: 0,
			careTimeOfDay: '08:00'
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

	it('take care lead days and a time of day in 5-minute steps', async () => {
		const { settings } = setup();
		expect(
			await settings.savePreference(sam, { care: false, careLeadDays: 7, careTimeOfDay: '18:30' })
		).toMatchObject({ ok: true, value: { care: false, careLeadDays: 7, careTimeOfDay: '18:30' } });
		expect(
			await settings.savePreference(sam, { careLeadDays: 4, careTimeOfDay: '18:31' })
		).toMatchObject({
			ok: false,
			error: {
				fields: { careLeadDays: expect.any(Array), careTimeOfDay: expect.any(Array) }
			}
		});
		expect(await settings.preference(sam)).toMatchObject({ careLeadDays: 7 });
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
