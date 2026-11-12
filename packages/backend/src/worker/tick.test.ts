import { describe, expect, it } from 'vitest';
import { createPlanner, type PlannerContext } from '../application/planner/planner.js';
import type { Exercise } from '../domain/exercise.js';
import type { Household } from '../domain/household.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { CLAIM_MS, testKey } from '../domain/reminders.js';
import { directUnitOfWork, memoryUsers } from '../testing/auth.js';
import { manualClock } from '../testing/clock.js';
import { memoryDogs } from '../testing/dogs.js';
import { memoryHouseholds } from '../testing/household.js';
import { memoryPlannedSessions, memoryTrainingPlans } from '../testing/planner.js';
import {
	fakePushSender,
	memoryPushDevices,
	memoryReminderPreferences,
	memoryReminders
} from '../testing/reminders.js';
import { memorySessionLogs } from '../testing/session-logs.js';
import { createWorker } from './tick.js';

// Tuesday 10 November 2026, 17:00 in Johannesburg (UTC+2).
const start = new Date('2026-11-10T15:00:00Z');
const MIN = 60_000;
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const noErrors = { capture() {}, flush: async () => {} };
const exercise: Exercise = {
	id: 'recall-basics',
	contentVersion: 1,
	title: 'Recall basics',
	skillArea: 'recall',
	goal: 'g',
	setup: 's',
	steps: ['a'],
	suggestedDurationMin: 5,
	successCriteria: 'c',
	ifStruggling: 'i',
	sources: [],
	reviewedTerms: []
};
const h1 = 'h1' as Id;
const sam = 'sam' as Id;
const alex = 'alex' as Id;
const kim = 'kim' as Id;
const ctx: PlannerContext = {
	userId: sam,
	householdId: h1,
	role: 'owner',
	timeZone: 'Africa/Johannesburg'
};
const household = (id: Id, members: Id[], timeZone = 'Africa/Johannesburg'): Household => ({
	id,
	name: id,
	timeZone,
	memberships: members.map((userId, i) => ({
		userId,
		role: i === 0 ? 'owner' : 'caregiver',
		joinedAt: start
	})),
	version: 1,
	createdAt: start,
	updatedAt: start
});
const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };

async function setup() {
	const clock = manualClock(start);
	const now = () => clock.now();
	const ids = createIdGenerator(() => now().getTime());
	const households = memoryHouseholds();
	await households.insert(household(h1, [sam, alex]));
	await households.insert(household('h2' as Id, [kim]));
	const dogs = memoryDogs(now);
	const dog = await dogs.insert({
		id: ids.next(),
		householdId: h1,
		name: 'Ripley',
		photo: { photoId: 'p' as Id, updatedAt: start },
		accent: 0
	});
	const ports = {
		households,
		plans: memoryTrainingPlans(now),
		plannedSessions: memoryPlannedSessions(now),
		sessionLogs: memorySessionLogs(now),
		dogs,
		exercises: {
			all: () => [exercise],
			get: (id: string) => (id === exercise.id ? exercise : undefined)
		},
		users: memoryUsers(),
		pushDevices: memoryPushDevices(now),
		reminderPreferences: memoryReminderPreferences(),
		reminders: memoryReminders(now),
		push: fakePushSender(),
		uow: directUnitOfWork,
		clock,
		ids,
		logger: silent,
		errors: noErrors
	};
	const planner = createPlanner(ports);
	const worker = createWorker(ports, planner, { intervalMs: 5 * MIN });
	const device = (userId: Id, name: string) =>
		ports.pushDevices.save({
			id: ids.next(),
			userId,
			endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
			keys,
			label: name
		});
	const schedule = async (date: string, time: string, repeat?: { days: number[] }) => {
		const made = await planner.schedule(ctx, {
			dogId: dog.id,
			exerciseId: exercise.id,
			date,
			time,
			...(repeat && { repeat })
		});
		if (!made.ok) throw new Error(JSON.stringify(made.error));
		return made.value.session;
	};
	const sentTo = () => ports.push.sent.map((s) => s.endpoint.split('/').at(-1));
	return { clock, ports, planner, worker, dog, device, schedule, sentTo, ids };
}

describe('training reminders', () => {
	it('reach every member with a device, at the session time, with what and who', async () => {
		const { worker, device, schedule, ports, sentTo, clock } = await setup();
		await device(sam, 'sam-phone');
		await device(sam, 'sam-tablet');
		await device(alex, 'alex-phone');
		const session = await schedule('2026-11-10', '17:30');

		clock.set('2026-11-10T15:25:00Z');
		expect((await worker.tick()).sent).toBe(0);
		clock.set('2026-11-10T15:30:00Z');
		const report = await worker.tick();

		expect(report).toMatchObject({ claimed: 2, sent: 2, failed: 0 });
		expect(sentTo().sort()).toEqual(['alex-phone', 'sam-phone', 'sam-tablet']);
		expect(ports.push.sent[0]!.payload).toEqual({
			reminderId: expect.any(String),
			kind: 'training',
			title: 'Training time: Recall basics',
			body: 'Ripley · 17:30',
			path: `sessions/${session.id}`,
			tag: `session-${session.id}`
		});
		expect(ports.push.sent[0]!.ttlSeconds).toBe(3600);
	});

	it('go out up to one interval early, never late', async () => {
		const { worker, device, schedule, sentTo, clock } = await setup();
		await device(sam, 'phone');
		await schedule('2026-11-10', '17:35');
		await schedule('2026-11-10', '17:40');

		// Ticks a minute off the grid: each sends what falls due before the next.
		clock.set('2026-11-10T15:31:00Z');
		await worker.tick();
		expect(sentTo()).toEqual(['phone']);
		clock.set('2026-11-10T15:36:00Z');
		await worker.tick();
		expect(sentTo()).toEqual(['phone', 'phone']);
	});

	it("follow each person's lead time, and only for those who want them", async () => {
		const { worker, device, schedule, ports, sentTo, clock } = await setup();
		await device(sam, 'sam');
		await device(alex, 'alex');
		await ports.reminderPreferences.save({ userId: sam, training: true, trainingLeadMin: 30 });
		await ports.reminderPreferences.save({ userId: alex, training: false, trainingLeadMin: 0 });
		await schedule('2026-11-10', '18:00');

		clock.set('2026-11-10T15:30:00Z');
		await worker.tick();
		expect(sentTo()).toEqual(['sam']);
		clock.set('2026-11-10T16:00:00Z');
		await worker.tick();
		expect(sentTo()).toEqual(['sam']);
	});

	it('are sent once however often and however many ticks run', async () => {
		const { worker, device, schedule, ports, clock } = await setup();
		await device(sam, 'phone');
		await schedule('2026-11-10', '17:30');
		const other = createWorker(ports, createPlanner(ports), { intervalMs: 5 * MIN });

		clock.set('2026-11-10T15:30:00Z');
		await Promise.all([worker.tick(), other.tick(), other.tick()]);
		clock.set('2026-11-10T15:35:00Z');
		await worker.tick();
		clock.set('2026-11-10T15:45:00Z');
		await worker.tick();

		expect(ports.push.sent).toHaveLength(1);
		expect(ports.reminders.all()).toMatchObject([{ status: 'sent', attempts: 1 }]);
	});

	it('follow a session moved to a new time, and not its old one (scenario 5)', async () => {
		const { worker, device, schedule, planner, ports, clock } = await setup();
		await device(sam, 'phone');
		const session = await schedule('2026-11-10', '17:30');
		await planner.update(ctx, {
			id: session.id,
			expectedVersion: session.version,
			changes: { time: '18:30' }
		});

		clock.set('2026-11-10T15:30:00Z');
		await worker.tick();
		expect(ports.push.sent).toHaveLength(0);
		clock.set('2026-11-10T16:30:00Z');
		await worker.tick();
		expect(ports.push.sent.map((s) => s.payload.body)).toEqual(['Ripley · 18:30']);
	});

	it('stop for sessions skipped, cancelled or done', async () => {
		const { worker, device, schedule, planner, ports, clock } = await setup();
		await device(sam, 'phone');
		const skipped = await schedule('2026-11-10', '17:30');
		const cancelled = await schedule('2026-11-10', '17:30');
		for (const [s, status] of [
			[skipped, 'skipped'],
			[cancelled, 'cancelled']
		] as const) {
			await planner.update(ctx, { id: s.id, expectedVersion: s.version, changes: { status } });
		}
		const done = await schedule('2026-11-10', '17:30');
		await ports.plannedSessions.update(h1, done.id, done.version, {
			status: 'completed',
			updatedBy: sam
		});

		clock.set('2026-11-10T15:30:00Z');
		await worker.tick();
		expect(ports.push.sent).toHaveLength(0);
	});

	it("aren't sent if the session changes between the claim and the send", async () => {
		const { worker, device, schedule, planner, ports, clock } = await setup();
		await device(sam, 'phone');
		const session = await schedule('2026-11-10', '17:30');
		ports.push.answers.set('https://fcm.googleapis.com/fcm/send/phone', {
			kind: 'failed',
			reason: 'push 503'
		});
		clock.set('2026-11-10T15:30:00Z');
		expect(await worker.tick()).toMatchObject({ retrying: 1 });

		await planner.update(ctx, {
			id: session.id,
			expectedVersion: session.version,
			changes: { status: 'skipped' }
		});
		ports.push.answers.clear();
		clock.set('2026-11-10T15:31:00Z');
		expect(await worker.tick()).toMatchObject({ skipped: 1, sent: 0 });
		expect(ports.push.sent).toHaveLength(0);
		expect(ports.reminders.all()).toMatchObject([
			{ status: 'skipped', lastError: 'subject changed' }
		]);
	});

	it('are retried with backoff, then given up on', async () => {
		const { worker, device, schedule, ports, clock } = await setup();
		await device(sam, 'phone');
		await schedule('2026-11-10', '17:30');
		ports.push.answers.set('https://fcm.googleapis.com/fcm/send/phone', {
			kind: 'failed',
			reason: 'push 500'
		});

		clock.set('2026-11-10T15:30:00Z');
		expect(await worker.tick()).toMatchObject({ retrying: 1 });
		expect(ports.reminders.all()[0]).toMatchObject({
			status: 'pending',
			attempts: 1,
			notBefore: new Date('2026-11-10T15:31:00Z')
		});
		clock.set('2026-11-10T15:31:00Z');
		expect(await worker.tick()).toMatchObject({ retrying: 1 });
		expect(ports.reminders.all()[0]!.notBefore).toEqual(new Date('2026-11-10T15:35:00Z'));
		clock.set('2026-11-10T15:35:00Z');
		expect(await worker.tick()).toMatchObject({ failed: 1 });
		expect(ports.reminders.all()[0]).toMatchObject({
			status: 'failed',
			attempts: 3,
			lastError: 'push 500'
		});
		expect(ports.pushDevices.all()[0]!.failureCount).toBe(3);
	});

	it('retry only the devices they missed', async () => {
		const { worker, device, schedule, ports, sentTo, clock } = await setup();
		await device(sam, 'phone');
		await device(sam, 'tablet');
		await schedule('2026-11-10', '17:30');
		ports.push.answers.set('https://fcm.googleapis.com/fcm/send/tablet', {
			kind: 'failed',
			reason: 'TimeoutError'
		});
		clock.set('2026-11-10T15:30:00Z');
		await worker.tick();
		ports.push.answers.clear();
		clock.set('2026-11-10T15:31:00Z');
		expect(await worker.tick()).toMatchObject({ sent: 1 });
		expect(sentTo()).toEqual(['phone', 'tablet']);
	});

	it('turn off a device the push service says is gone', async () => {
		const { worker, device, schedule, ports, clock } = await setup();
		await device(sam, 'phone');
		await schedule('2026-11-10', '17:30');
		await schedule('2026-11-10', '17:35');
		ports.push.answers.set('https://fcm.googleapis.com/fcm/send/phone', {
			kind: 'gone',
			status: 410
		});
		clock.set('2026-11-10T15:30:00Z');
		expect(await worker.tick()).toMatchObject({ failed: 1 });
		expect(ports.pushDevices.all()[0]!.disabledAt).toEqual(new Date('2026-11-10T15:30:00Z'));

		clock.set('2026-11-10T15:35:00Z');
		expect(await worker.tick()).toMatchObject({ claimed: 0 });
	});

	it('are taken up again when a tick dies holding one', async () => {
		const { worker, device, schedule, ports, clock, ids } = await setup();
		await device(sam, 'phone');
		const session = await schedule('2026-11-10', '17:30');
		const subject = { type: 'plannedSession' as const, id: session.id };
		// As if another instance claimed it at 17:25 and was stopped before sending.
		await ports.reminders.claimNew({
			id: ids.next(),
			householdId: h1,
			userId: sam,
			kind: 'training',
			subject,
			subjectAt: session.scheduledAt,
			key: `plannedSession:${session.id}:${session.scheduledAt.toISOString()}:${sam}`,
			dueAt: session.scheduledAt,
			status: 'sending',
			attempts: 0,
			claim: 'dead',
			lockedUntil: new Date(new Date('2026-11-10T15:25:00Z').getTime() + CLAIM_MS),
			delivered: []
		});
		clock.set('2026-11-10T15:25:30Z');
		expect(await worker.tick()).toMatchObject({ claimed: 0 });
		clock.set('2026-11-10T15:26:30Z');
		expect(await worker.tick()).toMatchObject({ claimed: 1, sent: 1 });
		expect(ports.push.sent).toHaveLength(1);
	});

	it('make up for a missed tick, but not for long, nor for sessions set up after the time', async () => {
		const { worker, device, schedule, ports, clock } = await setup();
		await device(sam, 'phone');
		await schedule('2026-11-10', '17:30');
		await schedule('2026-11-10', '17:00');
		clock.set('2026-11-10T15:28:00Z');
		await schedule('2026-11-10', '17:25');

		clock.set('2026-11-10T15:45:00Z');
		await worker.tick();
		expect(ports.push.sent.map((s) => s.payload.body)).toEqual(['Ripley · 17:30']);
	});

	it('go only to members of the household, and not for archived dogs', async () => {
		const { worker, device, schedule, ports, dog, sentTo, clock } = await setup();
		await device(kim, 'kim');
		await device(sam, 'sam');
		await schedule('2026-11-10', '17:30');
		await ports.dogs.update(h1, dog.id, dog.version, { archivedAt: start });
		clock.set('2026-11-10T15:30:00Z');
		await worker.tick();
		expect(sentTo()).toEqual([]);
	});

	it("extend a series nobody has opened, so tomorrow's sessions exist", async () => {
		const { worker, device, schedule, ports, clock } = await setup();
		await device(sam, 'phone');
		await schedule('2026-11-10', '17:30', { days: [1, 2, 3, 4, 5, 6, 7] });
		const last = () => ports.plans.all()[0]!.horizon;
		expect(last()).toBe('2026-12-01');

		clock.set('2026-11-25T15:00:00Z');
		expect(await worker.tick()).toMatchObject({ extended: 1 });
		expect(last()).toBe('2026-12-16');
		clock.set('2026-11-25T15:30:00Z');
		expect(await worker.tick()).toMatchObject({ extended: 0, sent: 1 });
	});
});

describe('test reminders', () => {
	it('go to the one device, no earlier than their time', async () => {
		const { worker, device, ports, sentTo, clock, ids } = await setup();
		const phone = await device(sam, 'phone');
		await device(sam, 'tablet');
		const id = ids.next();
		await ports.reminders.insert({
			id,
			householdId: h1,
			userId: sam,
			kind: 'test',
			key: testKey(id),
			dueAt: new Date('2026-11-10T15:03:00Z'),
			status: 'pending',
			attempts: 0,
			notBefore: new Date('2026-11-10T15:03:00Z'),
			deviceId: phone.id,
			delivered: []
		});

		clock.set('2026-11-10T15:02:59Z');
		expect(await worker.tick()).toMatchObject({ claimed: 0 });
		clock.set('2026-11-10T15:05:00Z');
		expect(await worker.tick()).toMatchObject({ sent: 1 });
		expect(sentTo()).toEqual(['phone']);
		expect(ports.push.sent[0]!.payload).toMatchObject({
			kind: 'test',
			title: 'Reminders are working',
			path: 'settings/notifications?test=arrived'
		});
	});
});
