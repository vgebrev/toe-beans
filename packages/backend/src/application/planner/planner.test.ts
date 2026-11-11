import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../domain/exercise.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { directUnitOfWork, memoryUsers } from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { memoryDogs } from '../../testing/dogs.js';
import { memoryPlannedSessions, memoryTrainingPlans } from '../../testing/planner.js';
import { memorySessionLogs } from '../../testing/session-logs.js';
import { createPlanner, type PlannerContext } from './planner.js';

// Tuesday 10 November 2026, 08:00 in Johannesburg.
const at = new Date('2026-11-10T06:00:00Z');
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const person = (id: string, displayName: string): User => ({
	id: id as Id,
	identities: [],
	email: `${id}@example.com`,
	displayName,
	displayNameSource: 'user',
	version: 1,
	createdAt: at,
	updatedAt: at
});
const zone = { timeZone: 'Africa/Johannesburg' };
const sam: PlannerContext = {
	userId: 'sam' as Id,
	householdId: 'h1' as Id,
	role: 'owner',
	...zone
};
const alex: PlannerContext = {
	userId: 'alex' as Id,
	householdId: 'h1' as Id,
	role: 'caregiver',
	...zone
};
const outsider: PlannerContext = {
	userId: 'out' as Id,
	householdId: 'h9' as Id,
	role: 'owner',
	...zone
};
const exercise = (id: string, title: string): Exercise => ({
	id,
	contentVersion: 1,
	title,
	skillArea: 'recall',
	goal: 'g',
	setup: 's',
	steps: ['a'],
	suggestedDurationMin: 5,
	successCriteria: 'c',
	ifStruggling: 'i',
	sources: [],
	reviewedTerms: []
});
const library = [
	exercise('recall-basics', 'Recall basics'),
	exercise('settle-mat', 'Settle on a mat')
];

async function setup() {
	const clock = manualClock(at);
	const now = () => clock.now();
	const users = memoryUsers();
	for (const u of [person('sam', 'Sam'), person('alex', 'Alex')]) await users.insert(u);
	const ids = createIdGenerator(() => now().getTime());
	const dogs = memoryDogs(now);
	const dog = await dogs.insert({
		id: ids.next(),
		householdId: 'h1' as Id,
		name: 'Ripley',
		photo: { photoId: 'p1' as Id, updatedAt: at },
		accent: 0
	});
	const archived = await dogs.insert({
		id: ids.next(),
		householdId: 'h1' as Id,
		name: 'Old',
		photo: { photoId: 'p2' as Id, updatedAt: at },
		accent: 1,
		archivedAt: at
	});
	const plans = memoryTrainingPlans(now);
	const sessions = memoryPlannedSessions(now);
	const planner = createPlanner({
		plans,
		plannedSessions: sessions,
		sessionLogs: memorySessionLogs(now),
		dogs,
		exercises: { all: () => library, get: (id) => library.find((e) => e.id === id) },
		users,
		uow: directUnitOfWork,
		clock,
		ids,
		logger: silent
	});
	const schedule = async (
		input: Partial<Parameters<typeof planner.schedule>[1]> = {},
		ctx = sam
	) => {
		const created = await planner.schedule(ctx, {
			dogId: dog.id,
			exerciseId: 'recall-basics',
			date: '2026-11-10',
			time: '17:30',
			...input
		});
		if (!created.ok) throw new Error(JSON.stringify(created.error));
		return created.value;
	};
	const dates = () =>
		sessions
			.all()
			.map((s) => `${s.occurrenceKey ?? '-'} ${s.status}`)
			.sort();
	return { clock, plans, sessions, planner, dogs, ids, dog, archived, schedule, dates };
}

describe('scheduling one session', () => {
	it('stores it at the instant the household means', async () => {
		const { schedule, dog } = await setup();
		const view = await schedule();
		expect(view).toEqual({
			session: {
				id: expect.any(String),
				householdId: 'h1',
				dogId: dog.id,
				exerciseId: 'recall-basics',
				scheduledAt: new Date('2026-11-10T15:30:00Z'),
				status: 'planned',
				updatedBy: 'sam',
				version: 1,
				createdAt: at,
				updatedAt: at
			},
			plan: null,
			exercise: library[0],
			log: null,
			updatedByName: 'Sam'
		});
	});

	it('refuses an archived dog, another household’s dog and an unknown exercise', async () => {
		const { planner, archived, dog } = await setup();
		const input = { date: '2026-11-10', time: '17:30' };
		expect(
			await planner.schedule(sam, { ...input, dogId: archived.id, exerciseId: 'nope' })
		).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The session is not valid.',
				fields: {
					dogId: ['Choose one of your dogs.'],
					exerciseId: ['Choose an exercise from the library.']
				}
			}
		});
		expect(
			await planner.schedule(outsider, { ...input, dogId: dog.id, exerciseId: 'recall-basics' })
		).toMatchObject({ ok: false, error: { fields: { dogId: ['Choose one of your dogs.'] } } });
	});

	it('refuses a date before today on the household’s clocks', async () => {
		const { planner, dog } = await setup();
		const result = await planner.schedule(sam, {
			dogId: dog.id,
			exerciseId: 'recall-basics',
			date: '2026-11-09',
			time: '17:30'
		});
		expect(result).toMatchObject({
			ok: false,
			error: { fields: { date: ['Choose today or a later date.'] } }
		});
	});
});

describe('scheduling a series', () => {
	it('materialises its sessions three weeks ahead', async () => {
		const { schedule, dates, plans } = await setup();
		const first = await schedule({ repeat: { days: [1, 3, 5] } });
		expect(first.session.occurrenceKey).toBe('2026-11-11');
		expect(first.plan).toMatchObject({
			startDate: '2026-11-10',
			time: '17:30',
			days: [1, 3, 5],
			horizon: '2026-12-01'
		});
		expect(dates()).toEqual([
			'2026-11-11 planned',
			'2026-11-13 planned',
			'2026-11-16 planned',
			'2026-11-18 planned',
			'2026-11-20 planned',
			'2026-11-23 planned',
			'2026-11-25 planned',
			'2026-11-27 planned',
			'2026-11-30 planned'
		]);
		expect(plans.all()).toHaveLength(1);
	});

	it('stops at the end date', async () => {
		const { schedule, dates } = await setup();
		await schedule({ repeat: { days: [1, 2, 3, 4, 5, 6, 7], until: '2026-11-12' } });
		expect(dates()).toEqual(['2026-11-10 planned', '2026-11-11 planned', '2026-11-12 planned']);
	});

	it('refuses a series none of whose days falls before the end', async () => {
		const { planner, dog, plans } = await setup();
		const result = await planner.schedule(sam, {
			dogId: dog.id,
			exerciseId: 'recall-basics',
			date: '2026-11-10',
			time: '17:30',
			repeat: { days: [6], until: '2026-11-13' }
		});
		expect(result).toMatchObject({
			ok: false,
			error: { fields: { 'repeat.until': ['None of the chosen days falls before the end date.'] } }
		});
		// The real transaction rolls back; the direct one in this test doesn't.
		expect(plans.all()).toHaveLength(1);
	});

	it('extends the horizon when a later week is listed, without doubling any session', async () => {
		const { schedule, planner, sessions } = await setup();
		await schedule({ repeat: { days: [1] } });
		const listed = await planner.list(alex, { from: '2026-12-14', to: '2026-12-20' });
		expect(listed.ok && listed.value.map((v) => v.session.occurrenceKey)).toEqual(['2026-12-14']);
		const again = await planner.list(alex, { from: '2026-12-14', to: '2026-12-20' });
		expect(again.ok && again.value).toHaveLength(1);
		expect(sessions.all().map((s) => s.occurrenceKey)).toEqual([
			'2026-11-16',
			'2026-11-23',
			'2026-11-30',
			'2026-12-07',
			'2026-12-14'
		]);
	});

	it('keeps extending as the days pass', async () => {
		const { schedule, planner, sessions, clock } = await setup();
		await schedule({ repeat: { days: [2] } });
		expect(sessions.all()).toHaveLength(4); // 10, 17, 24 Nov and 1 Dec
		clock.set(new Date('2026-11-20T06:00:00Z'));
		await planner.list(sam, { from: '2026-11-16', to: '2026-11-22' });
		expect(sessions.all().map((s) => s.occurrenceKey)).toContain('2026-12-08');
	});
});

describe('listing', () => {
	it('lists the household’s sessions on the dates, on its clocks, in time order', async () => {
		const { schedule, planner } = await setup();
		await schedule({ time: '17:30' });
		await schedule({ time: '07:00' });
		await schedule({ date: '2026-11-11', time: '00:00' });
		const listed = await planner.list(alex, { from: '2026-11-10', to: '2026-11-10' });
		expect(listed.ok && listed.value.map((v) => v.session.scheduledAt.toISOString())).toEqual([
			'2026-11-10T05:00:00.000Z',
			'2026-11-10T15:30:00.000Z'
		]);
		const theirs = await planner.list(outsider, { from: '2026-11-10', to: '2026-11-11' });
		expect(theirs).toEqual({ ok: true, value: [] });
	});

	it('refuses a range that is backwards, too long or too far ahead', async () => {
		const { planner } = await setup();
		for (const range of [
			{ from: '2026-11-10', to: '2026-11-09' },
			{ from: '2026-11-01', to: '2026-12-31' },
			{ from: '2027-12-01', to: '2027-12-07' },
			{ from: 'soon', to: '2026-11-09' }
		]) {
			expect(await planner.list(sam, range)).toMatchObject({
				ok: false,
				error: { kind: 'validation' }
			});
		}
	});
});

describe('changing one session', () => {
	it('reschedules, skips and brings back, saying who changed it', async () => {
		const { schedule, planner } = await setup();
		const { session } = await schedule();
		const moved = await planner.update(alex, {
			id: session.id,
			expectedVersion: 1,
			changes: { date: '2026-11-12', time: '08:15' }
		});
		expect(moved).toMatchObject({
			ok: true,
			value: {
				session: { scheduledAt: new Date('2026-11-12T06:15:00Z'), version: 2, updatedBy: 'alex' },
				updatedByName: 'Alex'
			}
		});
		const skipped = await planner.update(sam, {
			id: session.id,
			expectedVersion: 2,
			changes: { status: 'skipped' }
		});
		expect(skipped).toMatchObject({ ok: true, value: { session: { status: 'skipped' } } });
		const back = await planner.update(sam, {
			id: session.id,
			expectedVersion: 3,
			changes: { status: 'planned' }
		});
		expect(back).toMatchObject({ ok: true, value: { session: { status: 'planned' } } });
	});

	it('moves only that session of a series', async () => {
		const { schedule, planner, sessions } = await setup();
		const first = await schedule({ repeat: { days: [3] } });
		await planner.update(sam, {
			id: first.session.id,
			expectedVersion: 1,
			changes: { time: '09:00', exerciseId: 'settle-mat' }
		});
		const [moved, next] = sessions.all();
		expect(moved).toMatchObject({ occurrenceKey: '2026-11-11', exerciseId: 'settle-mat' });
		expect(next).toMatchObject({ occurrenceKey: '2026-11-18', exerciseId: 'recall-basics' });
	});

	it('refuses a stale version, another household and a logged session', async () => {
		const { schedule, planner, sessions } = await setup();
		const { session } = await schedule();
		const skip = { status: 'skipped' } as const;
		expect(
			await planner.update(sam, { id: session.id, expectedVersion: 2, changes: skip })
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
		expect(
			await planner.update(outsider, { id: session.id, expectedVersion: 1, changes: skip })
		).toEqual({ ok: false, error: { kind: 'not-found', resource: 'session' } });
		await sessions.update('h1' as Id, session.id, 1, {
			status: 'completed',
			updatedBy: 'sam' as Id
		});
		expect(
			await planner.update(sam, { id: session.id, expectedVersion: 2, changes: skip })
		).toMatchObject({ ok: false, error: { kind: 'conflict' } });
	});

	it('refuses moving it before today', async () => {
		const { schedule, planner } = await setup();
		const { session } = await schedule();
		expect(
			await planner.update(sam, {
				id: session.id,
				expectedVersion: 1,
				changes: { date: '2026-11-09' }
			})
		).toMatchObject({ ok: false, error: { fields: { date: ['Choose today or a later date.'] } } });
	});
});

describe('changing a series from a session on', () => {
	it('ends the old series before it and starts the changed one there', async () => {
		const { schedule, planner, plans, sessions, dates } = await setup();
		const first = await schedule({ repeat: { days: [1, 3, 5] } });
		const third = sessions.all()[2]!; // Mon 16 Nov
		const changed = await planner.updateSeries(alex, {
			planId: first.plan!.id,
			expectedVersion: 1,
			fromSessionId: third.id,
			changes: { time: '18:00', repeat: { days: [2, 4] } }
		});
		expect(changed).toMatchObject({
			ok: true,
			value: {
				session: { occurrenceKey: '2026-11-17', scheduledAt: new Date('2026-11-17T16:00:00Z') },
				plan: { startDate: '2026-11-16', time: '18:00', days: [2, 4], updatedBy: 'alex' }
			}
		});
		const [old] = plans.all();
		expect(old).toMatchObject({ until: '2026-11-15', version: 2 });
		expect(dates().slice(0, 4)).toEqual([
			'2026-11-11 planned',
			'2026-11-13 planned',
			'2026-11-17 planned',
			'2026-11-19 planned'
		]);
	});

	it('keeps logged sessions', async () => {
		const { schedule, planner, sessions } = await setup();
		const first = await schedule({ repeat: { days: [1, 2, 3, 4, 5, 6, 7] } });
		const tomorrow = sessions.all()[1]!;
		await sessions.update('h1' as Id, tomorrow.id, 1, {
			status: 'completed',
			updatedBy: 'sam' as Id
		});
		await planner.updateSeries(sam, {
			planId: first.plan!.id,
			expectedVersion: 1,
			fromSessionId: first.session.id,
			changes: { exerciseId: 'settle-mat' }
		});
		const on11 = sessions.all().filter((s) => s.occurrenceKey === '2026-11-11');
		expect(on11.map((s) => [s.status, s.exerciseId])).toEqual([
			['completed', 'recall-basics'],
			['planned', 'settle-mat']
		]);
	});

	it('refuses a stale series and a session from another series', async () => {
		const { schedule, planner } = await setup();
		const a = await schedule({ repeat: { days: [1] } });
		const b = await schedule({ repeat: { days: [2] } });
		expect(
			await planner.updateSeries(sam, {
				planId: a.plan!.id,
				expectedVersion: 2,
				fromSessionId: a.session.id,
				changes: {}
			})
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
		expect(
			await planner.updateSeries(sam, {
				planId: a.plan!.id,
				expectedVersion: 1,
				fromSessionId: b.session.id,
				changes: {}
			})
		).toEqual({ ok: false, error: { kind: 'not-found', resource: 'session' } });
		expect(
			await planner.endSeries(outsider, {
				planId: a.plan!.id,
				expectedVersion: 1,
				fromSessionId: a.session.id
			})
		).toEqual({ ok: false, error: { kind: 'not-found', resource: 'plan' } });
	});

	it('cancels a session and the rest of its series', async () => {
		const { schedule, planner, sessions, plans, dates } = await setup();
		const first = await schedule({ repeat: { days: [3] } });
		const second = sessions.all()[1]!;
		expect(
			await planner.endSeries(sam, {
				planId: first.plan!.id,
				expectedVersion: 1,
				fromSessionId: second.id
			})
		).toEqual({ ok: true, value: undefined });
		expect(dates()).toEqual(['2026-11-11 planned']);
		expect(plans.all()[0]).toMatchObject({ until: '2026-11-17' });
		// Listing later weeks adds nothing back.
		await planner.list(sam, { from: '2026-12-14', to: '2026-12-20' });
		expect(dates()).toEqual(['2026-11-11 planned']);
	});
});

describe('archiving a dog and bringing it back', () => {
	it('cancels what it had planned and pauses its series, leaving other dogs alone', async () => {
		const { planner, plans, sessions, dogs, ids, dog, schedule } = await setup();
		const other = await dogs.insert({
			id: ids.next(),
			householdId: 'h1' as Id,
			name: 'Pip',
			photo: { photoId: 'p3' as Id, updatedAt: at },
			accent: 2
		});
		const once = await schedule({ date: '2026-11-12' });
		const series = await schedule({ repeat: { days: [1, 3, 5] } });
		const skipped = await planner.update(sam, {
			id: series.session.id,
			expectedVersion: 1,
			changes: { status: 'skipped' }
		});
		expect(skipped.ok).toBe(true);
		const pips = await schedule({ dogId: other.id });

		expect(await planner.dogArchived(alex, dog.id)).toEqual({ ok: true, value: undefined });

		expect(plans.all()).toMatchObject([
			{ id: series.plan!.id, paused: true, updatedBy: 'alex', version: 2 }
		]);
		const byId = () => new Map(sessions.all().map((s) => [s.id, s]));
		expect(byId().get(once.session.id)).toMatchObject({
			status: 'cancelled',
			cancelledWithDog: true,
			updatedBy: 'alex',
			version: 2
		});
		expect(byId().get(series.session.id)).toMatchObject({ status: 'skipped' });
		const ofSeries = () => sessions.all().filter((s) => s.planId === series.plan!.id);
		expect(ofSeries().length).toBeGreaterThan(1);
		expect(ofSeries().filter((s) => s.status === 'planned')).toEqual([]);
		expect(byId().get(pips.session.id)).toMatchObject({ status: 'planned', version: 1 });

		// A paused series gets nothing new when a later week is listed.
		const later = await planner.list(sam, { from: '2027-01-04', to: '2027-01-10' });
		expect(later.ok && later.value).toEqual([]);
	});

	it('plans again what archiving cancelled, from now on, and the series carries on', async () => {
		const { planner, plans, sessions, dog, schedule, clock } = await setup();
		const once = await schedule({ date: '2026-11-12' });
		const byHand = await schedule({ date: '2026-11-13' });
		await planner.update(sam, {
			id: byHand.session.id,
			expectedVersion: 1,
			changes: { status: 'cancelled' }
		});
		const series = await schedule({ repeat: { days: [1, 2, 3, 4, 5, 6, 7] } });
		await planner.dogArchived(sam, dog.id);

		// Back after a month: 10 December, 08:00 in Johannesburg.
		clock.set(new Date('2026-12-10T06:00:00Z'));
		expect(await planner.dogRestored(alex, dog.id)).toEqual({ ok: true, value: undefined });

		expect(plans.all()[0]).not.toHaveProperty('paused');
		const byId = new Map(sessions.all().map((s) => [s.id, s]));
		// Past by now, so it stays cancelled; cancelled by hand stays too.
		expect(byId.get(once.session.id)).toMatchObject({ status: 'cancelled' });
		expect(byId.get(byHand.session.id)).toMatchObject({ status: 'cancelled' });
		const ofSeries = sessions.all().filter((s) => s.planId === series.plan!.id);
		const planned = ofSeries.filter((s) => s.status === 'planned').map((s) => s.occurrenceKey);
		// Nothing for the days it was away; every day from today for three weeks.
		expect(planned[0]).toBe('2026-12-10');
		expect(planned).toContain('2026-12-31');
		expect(
			ofSeries.filter((s) => s.occurrenceKey! < '2026-12-10' && s.status === 'planned')
		).toEqual([]);
		expect(
			ofSeries.filter((s) => s.occurrenceKey! > '2026-12-01' && s.occurrenceKey! < '2026-12-10')
		).toEqual([]);
	});

	it('plans again a session still ahead', async () => {
		const { planner, sessions, dog, schedule } = await setup();
		const once = await schedule({ date: '2026-11-12' });
		await planner.dogArchived(sam, dog.id);
		await planner.dogRestored(sam, dog.id);
		expect(sessions.all().find((s) => s.id === once.session.id)).toMatchObject({
			status: 'planned',
			version: 3
		});
		expect(sessions.all()[0]).not.toHaveProperty('cancelledWithDog');
	});
});
