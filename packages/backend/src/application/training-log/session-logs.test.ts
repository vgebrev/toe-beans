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
import { createSessionLogs } from './session-logs.js';

// Tuesday 10 November 2026, 17:00 in Johannesburg.
const at = new Date('2026-11-10T15:00:00Z');
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
const ctx = (userId: string, householdId = 'h1'): PlannerContext => ({
	userId: userId as Id,
	householdId: householdId as Id,
	role: 'owner',
	timeZone: 'Africa/Johannesburg'
});
const sam = ctx('sam');
const alex = ctx('alex');
const outsider = ctx('out', 'h9');
const recall: Exercise = {
	id: 'recall-basics',
	contentVersion: 3,
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
	const plannedSessions = memoryPlannedSessions(now);
	const sessionLogs = memorySessionLogs(now);
	const exercises = {
		all: () => [recall],
		get: (id: string) => (id === recall.id ? recall : undefined)
	};
	const ports = {
		plans: memoryTrainingPlans(now),
		plannedSessions,
		sessionLogs,
		dogs,
		exercises,
		users,
		uow: directUnitOfWork,
		clock,
		ids,
		logger: silent
	};
	const planner = createPlanner(ports);
	const logs = createSessionLogs(ports);
	const plan = async (time = '16:30') => {
		const created = await planner.schedule(sam, {
			dogId: dog.id,
			exerciseId: recall.id,
			date: '2026-11-10',
			time
		});
		if (!created.ok) throw new Error(JSON.stringify(created.error));
		return created.value.session;
	};
	return { clock, logs, planner, plannedSessions, sessionLogs, dog, archived, plan, ports };
}

describe('logging ad hoc', () => {
	it('defaults to now and not assessed, and records who and which content version', async () => {
		const { logs, dog } = await setup();
		const created = await logs.create(sam, { dogId: dog.id, exerciseId: recall.id });
		expect(created).toEqual({
			ok: true,
			value: {
				log: {
					id: expect.any(String),
					householdId: 'h1',
					dogId: dog.id,
					exerciseId: 'recall-basics',
					exerciseContentVersion: 3,
					caregiverId: 'sam',
					updatedBy: 'sam',
					practisedAt: at,
					outcome: 'not_assessed',
					version: 1,
					createdAt: at,
					updatedAt: at
				},
				exercise: recall,
				caregiverName: 'Sam',
				updatedByName: 'Sam'
			}
		});
	});

	it('takes the outcome and context', async () => {
		const { logs, dog } = await setup();
		const created = await logs.create(sam, {
			dogId: dog.id,
			exerciseId: recall.id,
			practisedAt: '2026-11-10T14:00:00Z',
			outcome: 'not_yet',
			durationMin: 10,
			emotionalState: 'uncertain',
			environment: 'public',
			environmentNote: 'Park',
			notes: 'Lots of squirrels.'
		});
		expect(created.ok && created.value.log).toMatchObject({
			practisedAt: new Date('2026-11-10T14:00:00Z'),
			outcome: 'not_yet',
			durationMin: 10,
			emotionalState: 'uncertain',
			environment: 'public',
			environmentNote: 'Park',
			notes: 'Lots of squirrels.'
		});
	});

	it('refuses an archived dog, another household’s dog, an unknown exercise and bad details', async () => {
		const { logs, dog, archived, sessionLogs } = await setup();
		expect(
			await logs.create(sam, { dogId: archived.id, exerciseId: 'nope', outcome: 'great' })
		).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The log is not valid.',
				fields: {
					outcome: ['Choose how it went, or Not assessed.'],
					dogId: ['Choose one of your dogs.'],
					exerciseId: ['Choose an exercise from the library.']
				}
			}
		});
		expect(await logs.create(outsider, { dogId: dog.id, exerciseId: recall.id })).toMatchObject({
			ok: false,
			error: { fields: { dogId: ['Choose one of your dogs.'] } }
		});
		expect(await logs.create(sam, { exerciseId: recall.id })).toMatchObject({ ok: false });
		expect(sessionLogs.all()).toEqual([]);
	});
});

describe('logging a planned session', () => {
	it('completes the session in the same transaction, with the session’s dog and exercise', async () => {
		const { logs, plan, plannedSessions, dog } = await setup();
		const session = await plan();
		const created = await logs.create(alex, { plannedSessionId: session.id, outcome: 'partial' });
		if (!created.ok) throw new Error(JSON.stringify(created.error));
		expect(created.value.log).toMatchObject({
			dogId: dog.id,
			exerciseId: 'recall-basics',
			plannedSessionId: session.id,
			caregiverId: 'alex',
			outcome: 'partial'
		});
		expect(await plannedSessions.findById('h1' as Id, session.id)).toMatchObject({
			status: 'completed',
			sessionLogId: created.value.log.id,
			updatedBy: 'alex',
			version: 2
		});
	});

	it('shows the outcome on the planned session', async () => {
		const { logs, plan, planner } = await setup();
		const session = await plan();
		const created = await logs.create(sam, { plannedSessionId: session.id, outcome: 'successful' });
		const read = await planner.get(sam, session.id);
		expect(read.ok && read.value.log).toMatchObject({
			id: created.ok && created.value.log.id,
			outcome: 'successful'
		});
		const listed = await planner.list(sam, { from: '2026-11-10', to: '2026-11-10' });
		expect(listed.ok && listed.value[0]!.log?.outcome).toBe('successful');
	});

	it('logs a missed session, but not one already logged, skipped or cancelled', async () => {
		const { logs, plan, planner } = await setup();
		const missed = await plan('08:00');
		expect((await logs.create(sam, { plannedSessionId: missed.id })).ok).toBe(true);
		expect(await logs.create(alex, { plannedSessionId: missed.id })).toEqual({
			ok: false,
			error: { kind: 'conflict', message: 'This session has already been logged.' }
		});

		const skipped = await plan('17:30');
		await planner.update(sam, {
			id: skipped.id,
			expectedVersion: 1,
			changes: { status: 'skipped' }
		});
		expect(await logs.create(sam, { plannedSessionId: skipped.id })).toEqual({
			ok: false,
			error: {
				kind: 'conflict',
				message: 'This session was skipped. Put it back in the plan to log it.'
			}
		});
	});

	it('refuses another household’s session as not found', async () => {
		const { logs, plan } = await setup();
		const session = await plan();
		expect(await logs.create(outsider, { plannedSessionId: session.id })).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'session' }
		});
		expect(await logs.create(sam, { plannedSessionId: 'nope' })).toMatchObject({
			ok: false,
			error: { kind: 'not-found' }
		});
	});

	it('refuses a dog or exercise that isn’t the session’s, and writes nothing', async () => {
		const { logs, plan, plannedSessions, sessionLogs, archived } = await setup();
		const session = await plan();
		const result = await logs.create(sam, {
			plannedSessionId: session.id,
			dogId: archived.id,
			outcome: 'bogus'
		});
		expect(result).toMatchObject({
			ok: false,
			error: {
				fields: {
					outcome: ['Choose how it went, or Not assessed.'],
					dogId: ["This isn't the planned session's dog."]
				}
			}
		});
		expect(sessionLogs.all()).toEqual([]);
		expect(await plannedSessions.findById('h1' as Id, session.id)).toMatchObject({
			status: 'planned',
			version: 1
		});
	});

	it('runs inside a unit of work', async () => {
		const { plan, ports } = await setup();
		const session = await plan();
		let runs = 0;
		const logs = createSessionLogs({
			...ports,
			uow: {
				run: async (work) => {
					runs++;
					return work();
				}
			}
		});
		expect((await logs.create(sam, { plannedSessionId: session.id })).ok).toBe(true);
		expect(runs).toBe(1);
	});
});

describe('editing a log', () => {
	it('changes the outcome and context against the version, keeping who practised', async () => {
		const { logs, dog, clock } = await setup();
		const created = await logs.create(sam, {
			dogId: dog.id,
			exerciseId: recall.id,
			environment: 'other',
			environmentNote: 'Vet',
			notes: 'n'
		});
		if (!created.ok) throw new Error();
		clock.advance(60_000);
		const updated = await logs.update(alex, {
			id: created.value.log.id,
			expectedVersion: 1,
			changes: { outcome: 'successful', environment: null, notes: null, durationMin: 3 }
		});
		expect(updated).toEqual({
			ok: true,
			value: {
				log: {
					...created.value.log,
					outcome: 'successful',
					durationMin: 3,
					environment: undefined,
					environmentNote: undefined,
					notes: undefined,
					updatedBy: 'alex',
					version: 2,
					updatedAt: new Date(at.getTime() + 60_000)
				},
				exercise: recall,
				caregiverName: 'Sam',
				updatedByName: 'Alex'
			}
		});
	});

	it('refuses a stale version, another household and bad details', async () => {
		const { logs, dog } = await setup();
		const created = await logs.create(sam, { dogId: dog.id, exerciseId: recall.id });
		if (!created.ok) throw new Error();
		const id = created.value.log.id;
		expect(await logs.update(sam, { id, expectedVersion: 2, changes: {} })).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect(await logs.update(outsider, { id, expectedVersion: 1, changes: {} })).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'log' }
		});
		expect(await logs.get(outsider, id)).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'log' }
		});
		expect(
			await logs.update(sam, {
				id,
				expectedVersion: 1,
				changes: { practisedAt: '2027-01-01T00:00:00Z' }
			})
		).toMatchObject({ ok: false, error: { kind: 'validation' } });
	});

	it('names a caregiver who has left as a former member', async () => {
		const { logs, dog } = await setup();
		const created = await logs.create(ctx('gone'), { dogId: dog.id, exerciseId: recall.id });
		expect(created.ok && created.value.caregiverName).toBe('A former member');
	});
});
