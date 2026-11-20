import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import type { NewReminder } from '../../application/ports/index.js';
import type { PlainTime } from '../../domain/calendar.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { manualClock } from '../../testing/clock.js';
import { migrate, migrations } from './migrations/index.js';
import { mongoPlannedSessions, mongoTrainingPlans } from './planner-collections.js';
import {
	mongoPushDevices,
	mongoReminderPreferences,
	mongoReminders,
	REMINDER_PREFERENCES
} from './reminder-collections.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-10T15:00:00Z');
const clock = manualClock(at);
const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const devices = () => mongoPushDevices(db.mongo.db, clock);
const prefs = () => mongoReminderPreferences(db.mongo.db);
const ledger = () => mongoReminders(db.mongo.db, clock);

const reminder = (overrides: Partial<NewReminder> = {}): NewReminder => {
	const id = ids.next();
	return {
		id,
		householdId: ids.next(),
		userId: ids.next(),
		kind: 'training',
		key: `k:${id}`,
		dueAt: at,
		status: 'sending',
		attempts: 0,
		claim: 'c1',
		lockedUntil: new Date(at.getTime() + 60_000),
		delivered: [],
		...overrides
	};
};

describe('mongoPushDevices', () => {
	it('keeps one device per endpoint, moving it to whoever saved it last and reviving it', async () => {
		const sam = ids.next();
		const alex = ids.next();
		const endpoint = `https://fcm.googleapis.com/fcm/send/${ids.next()}`;
		const first = (await devices().save({
			id: ids.next(),
			userId: sam,
			endpoint,
			keys,
			label: 'A'
		}))!;
		expect(first).toMatchObject({ userId: sam, label: 'A', failureCount: 0, createdAt: at });
		await devices().recordFailure(first.id);
		await devices().disable(first.id, at);
		expect(await devices().listLive([sam])).toEqual([]);

		const second = await devices().save({
			id: ids.next(),
			userId: alex,
			endpoint,
			keys,
			label: 'B'
		});
		expect(second).toMatchObject({ id: first.id, userId: alex, label: 'B', failureCount: 0 });
		expect(second!.disabledAt).toBeUndefined();
		expect(await devices().listForUser(sam)).toEqual([]);
		expect(await devices().listLive([sam, alex])).toHaveLength(1);
	});

	it('survives two saves of a new endpoint at once', async () => {
		const sam = ids.next();
		const endpoint = `https://fcm.googleapis.com/fcm/send/${ids.next()}`;
		const saved = await Promise.all(
			[1, 2, 3].map(() =>
				devices().save({ id: ids.next(), userId: sam, endpoint, keys, label: 'x' })
			)
		);
		expect(new Set(saved.map((d) => d!.id)).size).toBe(1);
	});

	it("removes all of one person's devices, and no one else's", async () => {
		const [sam, alex] = [ids.next(), ids.next()];
		const save = (userId: typeof sam) =>
			devices().save({
				id: ids.next(),
				userId,
				endpoint: `https://fcm.googleapis.com/fcm/send/${ids.next()}`,
				keys,
				label: 'x'
			});
		await save(sam);
		await save(sam);
		await save(alex);
		expect(await devices().removeAllForUser(sam)).toBe(2);
		expect(await devices().listForUser(sam)).toEqual([]);
		expect(await devices().listForUser(alex)).toHaveLength(1);
	});

	it("moves someone else's device only with its keys (security audit F6)", async () => {
		const [sam, alex] = [ids.next(), ids.next()];
		const endpoint = `https://fcm.googleapis.com/fcm/send/${ids.next()}`;
		const mine = await devices().save({ id: ids.next(), userId: sam, endpoint, keys, label: 'A' });
		const otherKeys = { p256dh: 'C'.repeat(87), auth: 'c'.repeat(22) };
		const save = (userId: typeof sam, k: typeof keys) =>
			devices().save({ id: ids.next(), userId, endpoint, keys: k, label: 'B' });
		expect(await save(alex, otherKeys)).toBeNull();
		expect(await devices().listForUser(sam)).toMatchObject([{ id: mine!.id, keys }]);
		// Its own person may renew the keys.
		expect(await save(sam, otherKeys)).toMatchObject({ id: mine!.id, keys: otherKeys });
	});

	it("finds and removes only the person's own", async () => {
		const sam = ids.next();
		const device = (await devices().save({
			id: ids.next(),
			userId: sam,
			endpoint: `https://fcm.googleapis.com/fcm/send/${ids.next()}`,
			keys,
			label: 'x'
		}))!;
		expect(await devices().findForUser(ids.next(), device.id)).toBeNull();
		expect(await devices().remove(ids.next(), device.id)).toBe(false);
		expect(await devices().findForUser(sam, device.id)).toMatchObject({ id: device.id });
		await devices().recordSuccess(device.id, at);
		expect((await devices().findForUser(sam, device.id))!.lastSuccessAt).toEqual(at);
		expect(await devices().remove(sam, device.id)).toBe(true);
	});

	it('removes a device by endpoint for its own person only (D43)', async () => {
		const [sam, alex] = [ids.next(), ids.next()];
		const endpoint = `https://fcm.googleapis.com/fcm/send/${ids.next()}`;
		await devices().save({ id: ids.next(), userId: sam, endpoint, keys, label: 'x' });
		expect(await devices().removeByEndpoint(alex, endpoint)).toBe(false);
		expect(await devices().removeByEndpoint(sam, endpoint)).toBe(true);
		expect(await devices().listForUser(sam)).toEqual([]);
	});

	it('is deleted 30 days after it was last seen or reached, or 14 after it stopped (D43)', async () => {
		const day = 24 * 60 * 60 * 1000;
		const plus = (d: Date, days: number) => new Date(d.getTime() + days * day);
		const sam = ids.next();
		const device = (await devices().save({
			id: ids.next(),
			userId: sam,
			endpoint: `https://fcm.googleapis.com/fcm/send/${ids.next()}`,
			keys,
			label: 'x'
		}))!;
		expect(device).toMatchObject({ lastSeenAt: at, staleAt: plus(at, 30) });
		await devices().recordSuccess(device.id, plus(at, 5));
		expect(await devices().findForUser(sam, device.id)).toMatchObject({ staleAt: plus(at, 35) });
		await devices().disable(device.id, plus(at, 6));
		expect(await devices().findForUser(sam, device.id)).toMatchObject({ staleAt: plus(at, 20) });
		// A stopped device taking a reminder can't happen, and wouldn't keep it.
		await devices().recordSuccess(device.id, plus(at, 7));
		expect(await devices().findForUser(sam, device.id)).toMatchObject({ staleAt: plus(at, 20) });

		const indexes = await db.mongo.db.collection('pushDevices').indexes();
		expect(indexes).toContainEqual(
			expect.objectContaining({ key: { staleAt: 1 }, expireAfterSeconds: 0 })
		);
	});
});

describe('mongoReminderPreferences', () => {
	it('saves and reads back, by person', async () => {
		const sam = ids.next();
		expect(await prefs().find(sam)).toBeNull();
		const pref = {
			userId: sam,
			training: false,
			trainingLeadMin: 15 as const,
			care: true,
			careLeadDays: 1 as const,
			careTimeOfDay: '07:30' as PlainTime,
			updatedAt: at
		};
		const saved = await prefs().save(pref);
		expect(saved).toEqual(pref);
		expect(await prefs().findMany([sam, ids.next()])).toEqual([saved]);
	});

	it('reads a schema 1 preference, from before care reminders, with the care defaults', async () => {
		const sam = ids.next();
		await db.mongo.db
			.collection(REMINDER_PREFERENCES)
			.insertOne({ _id: sam as never, training: true, trainingLeadMin: 5, schemaVersion: 1 });
		expect(await prefs().find(sam)).toEqual({
			userId: sam,
			training: true,
			trainingLeadMin: 5,
			care: true,
			careLeadDays: 0,
			careTimeOfDay: '08:00'
		});
	});
});

describe('mongoReminders', () => {
	it('claims a key once, however many ticks try at the same time', async () => {
		const key = `k:${ids.next()}`;
		const claims = await Promise.all(
			Array.from({ length: 5 }, () => ledger().claimNew(reminder({ key })))
		);
		expect(claims.filter(Boolean)).toHaveLength(1);
		expect(await ledger().existingKeys([key, 'other'])).toEqual(new Set([key]));
	});

	it('hands out each due or stuck reminder to one claimant, and settles only with its claim', async () => {
		const due = await ledger().insert(
			reminder({ status: 'pending', notBefore: new Date(at.getTime() - 1), dueAt: new Date(0) })
		);
		await ledger().insert(
			reminder({
				status: 'pending',
				notBefore: new Date(at.getTime() + 60_000),
				dueAt: new Date(1)
			})
		);
		const stuck = await ledger().claimNew(
			reminder({ claim: 'dead', lockedUntil: new Date(at.getTime() - 1), dueAt: new Date(2) })
		);
		expect(stuck).toBe(true);

		const lock = new Date(at.getTime() + 60_000);
		const claimed = await Promise.all(
			['a', 'b', 'c', 'd'].map((c) => ledger().claimNext(at, c, lock))
		);
		const got = claimed.filter((r) => r !== null);
		expect(got).toHaveLength(2);
		const first = got.find((r) => r.id === due.id)!;
		expect(first).toMatchObject({ status: 'sending', lockedUntil: lock });

		expect(
			await ledger().settle(first.id, 'wrong', { status: 'sent', attempts: 1, delivered: [] })
		).toBe(false);
		const device = ids.next();
		expect(
			await ledger().settle(first.id, first.claim!, {
				status: 'pending',
				attempts: 1,
				delivered: [device],
				lastError: 'push 503',
				notBefore: new Date(at.getTime() + 60_000)
			})
		).toBe(true);
		const row = await db.mongo.db.collection('reminders').findOne({ _id: first.id as never });
		expect(row).toMatchObject({ status: 'pending', delivered: [device], lastError: 'push 503' });
		expect(row).not.toHaveProperty('claim');
		expect(row).not.toHaveProperty('lockedUntil');
	});

	it("finds a person's latest test and marks it received once, only for them", async () => {
		const sam = ids.next() as Id;
		const older = await ledger().insert(reminder({ userId: sam, kind: 'test', status: 'pending' }));
		const latest = await ledger().insert(
			reminder({ userId: sam, kind: 'test', status: 'pending' })
		);
		expect((await ledger().latestTest(sam))!.id).toBe(latest.id);
		expect(older.id < latest.id).toBe(true);

		expect(await ledger().markReceived(ids.next(), latest.id, at)).toBe(false);
		expect(await ledger().markReceived(sam, latest.id, at)).toBe(true);
		expect(await ledger().markReceived(sam, latest.id, new Date(at.getTime() + 5))).toBe(true);
		expect((await ledger().latestTest(sam))!.receivedAt).toEqual(at);
	});
});

describe('the tick’s reads across households', () => {
	it('lists planned sessions in a window, every household’s', async () => {
		const sessions = mongoPlannedSessions(db.mongo.db, clock);
		const make = (householdId: Id, minutes: number, status: 'planned' | 'skipped' = 'planned') =>
			sessions.insert({
				id: ids.next(),
				householdId,
				dogId: ids.next(),
				exerciseId: 'recall-basics',
				scheduledAt: new Date(Date.UTC(2030, 0, 1, 12, minutes)),
				status,
				updatedBy: ids.next()
			});
		const a = await make(ids.next(), 0);
		const b = await make(ids.next(), 5);
		await make(ids.next(), 6, 'skipped');
		await make(ids.next(), 30);
		const found = await sessions.listPlannedAcrossHouseholds(
			new Date(Date.UTC(2030, 0, 1, 12, 0)),
			new Date(Date.UTC(2030, 0, 1, 12, 30))
		);
		expect(found.map((s) => s.id)).toEqual([a.id, b.id]);
	});

	it('finds households whose running series stop too soon', async () => {
		const plans = mongoTrainingPlans(db.mongo.db, clock);
		const plan = (householdId: Id, horizon: string, extra: object = {}) =>
			plans.insert({
				id: ids.next(),
				householdId,
				dogId: ids.next(),
				exerciseId: 'recall-basics',
				startDate: '2040-01-01' as never,
				times: ['17:00' as never],
				days: [1],
				horizon: horizon as never,
				updatedBy: ids.next(),
				...extra
			});
		const behind = ids.next();
		await plan(behind, '2040-01-05');
		await plan(ids.next(), '2040-02-01');
		await plan(ids.next(), '2040-01-05', { paused: true });
		await plan(ids.next(), '2040-01-05', { until: '2040-01-03' });
		expect(await plans.householdsBehind('2040-01-20' as never)).toEqual([behind]);
	});
});
