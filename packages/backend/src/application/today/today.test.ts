import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../domain/exercise.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { directUnitOfWork, memoryUsers } from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { memoryDogs } from '../../testing/dogs.js';
import { memoryPlannedSessions, memoryTrainingPlans } from '../../testing/planner.js';
import { memorySessionLogs } from '../../testing/session-logs.js';
import { createPlanner, type PlannerContext } from '../planner/planner.js';
import { createSessionLogs } from '../training-log/session-logs.js';
import { createToday } from './today.js';

// Monday 9 November 2026, 07:00 in Johannesburg: sessions are planned from here, then the clock
// moves on to Tuesday.
const monday = new Date('2026-11-09T05:00:00Z');
// Tuesday 10 November 2026, 17:00 in Johannesburg.
const tuesday = new Date('2026-11-10T15:00:00Z');
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const person = (id: string, displayName: string): User => ({
	id: id as Id,
	identities: [],
	email: `${id}@example.com`,
	displayName,
	displayNameSource: 'user',
	version: 1,
	createdAt: monday,
	updatedAt: monday
});
const ctx = (userId: string, householdId = 'h1'): PlannerContext => ({
	userId: userId as Id,
	householdId: householdId as Id,
	role: 'owner',
	timeZone: 'Africa/Johannesburg'
});
const sam = ctx('sam');
const alex = ctx('alex');
const outsider = ctx('out', 'h9');
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
const recall = exercise('recall-basics', 'Recall basics');
const settle = exercise('settle-on-mat', 'Settle on mat');

async function setup() {
	const clock = manualClock(monday);
	const now = () => clock.now();
	const users = memoryUsers();
	for (const u of [person('sam', 'Sam'), person('alex', 'Alex'), person('out', 'Out')]) {
		await users.insert(u);
	}
	const ids = createIdGenerator(() => now().getTime());
	const dogs = memoryDogs(now);
	const newDog = (name: string, householdId = 'h1') =>
		dogs.insert({
			id: ids.next(),
			householdId: householdId as Id,
			name,
			photo: { photoId: ids.next(), updatedAt: monday },
			accent: 0
		});
	const ripley = await newDog('Ripley');
	const miso = await newDog('Miso');
	const theirs = await newDog('Theirs', 'h9');
	const ports = {
		plans: memoryTrainingPlans(now),
		plannedSessions: memoryPlannedSessions(now),
		sessionLogs: memorySessionLogs(now),
		dogs,
		exercises: {
			all: () => [recall, settle],
			get: (id: string) => [recall, settle].find((e) => e.id === id)
		},
		users,
		uow: directUnitOfWork,
		clock,
		ids,
		logger: silent
	};
	const planner = createPlanner(ports);
	const sessionLogs = createSessionLogs(ports);
	const today = createToday(ports, { planner, sessionLogs });
	const plan = async (
		dogId: Id,
		date: string,
		time: string,
		{
			who = sam,
			exerciseId = recall.id,
			days
		}: { who?: PlannerContext; exerciseId?: string; days?: number[] } = {}
	) => {
		const created = await planner.schedule(who, {
			dogId,
			exerciseId,
			date,
			time,
			...(days && { repeat: { days } })
		});
		if (!created.ok) throw new Error(JSON.stringify(created.error));
		return created.value.session;
	};
	return { clock, ports, planner, sessionLogs, today, plan, ripley, miso, theirs };
}

const read = async (today: ReturnType<typeof createToday>, who = sam) => {
	const view = await today.read(who);
	if (!view.ok) throw new Error(JSON.stringify(view.error));
	return view.value;
};

describe('Today', () => {
	it('is the household’s date', async () => {
		const { clock, today } = await setup();
		clock.set(tuesday);
		expect((await read(today)).date).toBe('2026-11-10');
		// 01:30 on Wednesday in Johannesburg, still Tuesday in UTC.
		clock.set('2026-11-10T23:30:00Z');
		expect((await read(today)).date).toBe('2026-11-11');
	});

	it('splits still-planned sessions into overdue and planned at the current time', async () => {
		const { clock, today, plan, ripley, miso } = await setup();
		const lastNight = await plan(miso.id, '2026-11-09', '19:00');
		const morning = await plan(ripley.id, '2026-11-10', '08:00');
		const evening = await plan(miso.id, '2026-11-10', '17:30', { exerciseId: settle.id });
		const later = await plan(ripley.id, '2026-11-10', '19:00');
		await plan(ripley.id, '2026-11-11', '08:00');

		clock.set(tuesday);
		const view = await read(today);
		expect(view.overdue.map((v) => v.session.id)).toEqual([lastNight.id, morning.id]);
		expect(view.planned.map((v) => v.session.id)).toEqual([evening.id, later.id]);
		expect(view.planned[0]!.exercise).toBe(settle);
		expect(view.planned[0]!.updatedByName).toBe('Sam');

		// Half an hour on, the evening session is overdue too.
		clock.advance(31 * 60_000);
		const after = await read(today);
		expect(after.overdue.map((v) => v.session.id)).toEqual([lastNight.id, morning.id, evening.id]);
		expect(after.planned.map((v) => v.session.id)).toEqual([later.id]);
	});

	it('leaves out sessions planned before yesterday', async () => {
		const { clock, today, plan, ripley } = await setup();
		await plan(ripley.id, '2026-11-09', '08:00');
		clock.set('2026-11-11T15:00:00Z');
		const view = await read(today);
		expect(view.overdue).toEqual([]);
	});

	it('has a repeating series’ session for today without anyone opening Plan', async () => {
		const { clock, today, plan, ripley } = await setup();
		await plan(ripley.id, '2026-11-09', '18:00', { days: [1, 2, 3, 4, 5, 6, 7] });
		// Well past the 21-day horizon the series was first materialised to.
		clock.set('2026-12-15T10:00:00Z');
		const view = await read(today);
		expect(view.planned.map((v) => v.session.occurrenceKey)).toEqual(['2026-12-15']);
		expect(view.overdue.map((v) => v.session.occurrenceKey)).toEqual(['2026-12-14']);
	});

	it('lists every practice logged today as done, planned or ad hoc, with who practised', async () => {
		const { clock, today, plan, sessionLogs, ripley, miso } = await setup();
		const morning = await plan(ripley.id, '2026-11-10', '08:00');
		await plan(miso.id, '2026-11-09', '19:00');
		// Logged on Monday, ad hoc: not today's.
		await sessionLogs.create(sam, { dogId: ripley.id, exerciseId: recall.id });

		clock.set(tuesday);
		const planned = await sessionLogs.create(alex, {
			plannedSessionId: morning.id,
			outcome: 'partial',
			practisedAt: '2026-11-10T06:10:00Z'
		});
		const adHoc = await sessionLogs.create(sam, {
			dogId: miso.id,
			exerciseId: settle.id,
			practisedAt: '2026-11-10T05:00:00Z'
		});
		if (!planned.ok || !adHoc.ok) throw new Error('not logged');

		const view = await read(today);
		expect(view.done.map((v) => v.log.id)).toEqual([adHoc.value.log.id, planned.value.log.id]);
		expect(view.done[1]).toMatchObject({
			log: { outcome: 'partial', plannedSessionId: morning.id },
			caregiverName: 'Alex',
			exercise: recall
		});
		// Done, so neither planned nor overdue; Miso's from last night is still overdue.
		expect(view.overdue.map((v) => v.session.dogId)).toEqual([miso.id]);
		expect(view.planned).toEqual([]);
	});

	it('counts a session missed last night and logged this morning as done today', async () => {
		const { clock, today, plan, sessionLogs, miso } = await setup();
		const lastNight = await plan(miso.id, '2026-11-09', '19:00');
		clock.set(tuesday);
		const logged = await sessionLogs.create(sam, { plannedSessionId: lastNight.id });
		expect(logged.ok).toBe(true);
		const view = await read(today);
		expect(view.overdue).toEqual([]);
		expect(view.done.map((v) => v.log.plannedSessionId)).toEqual([lastNight.id]);
	});

	it('collects today’s skipped and cancelled sessions, never as done', async () => {
		const { clock, today, plan, planner, ripley, miso } = await setup();
		const skipped = await plan(ripley.id, '2026-11-10', '08:00');
		const cancelled = await plan(miso.id, '2026-11-10', '18:00');
		const yesterday = await plan(miso.id, '2026-11-09', '19:00');
		for (const [s, status] of [
			[skipped, 'skipped'],
			[cancelled, 'cancelled'],
			[yesterday, 'skipped']
		] as const) {
			const changed = await planner.update(sam, {
				id: s.id,
				expectedVersion: s.version,
				changes: { status }
			});
			expect(changed.ok).toBe(true);
		}
		clock.set(tuesday);
		const view = await read(today);
		expect(view.skipped.map((v) => v.session.id)).toEqual([skipped.id, cancelled.id]);
		expect(view.overdue).toEqual([]);
		expect(view.planned).toEqual([]);
		expect(view.done).toEqual([]);
	});

	it('leaves out an archived dog’s sessions', async () => {
		const { clock, today, plan, planner, ripley, miso } = await setup();
		await plan(ripley.id, '2026-11-10', '18:00');
		const kept = await plan(miso.id, '2026-11-10', '18:00');
		// What archiving Ripley does to its sessions (D24).
		expect((await planner.dogArchived(sam, ripley.id)).ok).toBe(true);
		clock.set(tuesday);
		const view = await read(today);
		expect(view.planned.map((v) => v.session.id)).toEqual([kept.id]);
		expect(view.skipped).toEqual([]);
	});

	it('shows only the household’s own day', async () => {
		const { clock, today, plan, sessionLogs, ripley, theirs } = await setup();
		await plan(ripley.id, '2026-11-10', '18:00');
		await plan(theirs.id, '2026-11-10', '18:00', { who: outsider });
		clock.set(tuesday);
		await sessionLogs.create(sam, { dogId: ripley.id, exerciseId: recall.id });
		await sessionLogs.create(outsider, { dogId: theirs.id, exerciseId: recall.id });
		const ours = await read(today);
		const other = await read(today, outsider);
		expect(ours.planned.map((v) => v.session.dogId)).toEqual([ripley.id]);
		expect(ours.done.map((v) => v.log.dogId)).toEqual([ripley.id]);
		expect(other.planned.map((v) => v.session.dogId)).toEqual([theirs.id]);
		expect(other.done.map((v) => v.log.dogId)).toEqual([theirs.id]);
	});
});
