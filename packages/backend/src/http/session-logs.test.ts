import { describe, expect, it } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { createPlanner } from '../application/planner/planner.js';
import { createSessionLogs } from '../application/training-log/session-logs.js';
import type { Exercise } from '../domain/exercise.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { directUnitOfWork, memoryUsers } from '../testing/auth.js';
import { manualClock } from '../testing/clock.js';
import { memoryDogs } from '../testing/dogs.js';
import { memoryPlannedSessions, memoryTrainingPlans } from '../testing/planner.js';
import { memorySessionLogs } from '../testing/session-logs.js';
import { createPlannerHttp } from './planner.js';
import { createSessionLogsHttp } from './session-logs.js';

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
// Tuesday 10 November 2026, 17:00 in Johannesburg.
const at = new Date('2026-11-10T15:00:00Z');

const noHousehold: Viewer = {
	auth: { userId: 'u' as Id },
	displayName: 'Sam',
	email: 'sam@example.com',
	member: null
};
const member = (householdId: string): MemberViewer => ({
	...noHousehold,
	member: {
		userId: 'u' as Id,
		householdId: householdId as Id,
		role: 'caregiver',
		householdName: 'The Does',
		timeZone: 'Africa/Johannesburg'
	}
});
const viewer = member('h1');
const outsider = member('h2');
const recall: Exercise = {
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

async function setup() {
	const clock = manualClock(at);
	const now = () => clock.now();
	const users = memoryUsers();
	await users.insert({
		id: 'u' as Id,
		identities: [],
		email: 'sam@example.com',
		displayName: 'Sam',
		displayNameSource: 'user',
		version: 1,
		createdAt: at,
		updatedAt: at
	});
	const ids = createIdGenerator(() => now().getTime());
	const dogs = memoryDogs(now);
	const dog = await dogs.insert({
		id: ids.next(),
		householdId: 'h1' as Id,
		name: 'Ripley',
		photo: { photoId: ids.next(), updatedAt: at },
		accent: 0
	});
	const ports = {
		plans: memoryTrainingPlans(now),
		plannedSessions: memoryPlannedSessions(now),
		sessionLogs: memorySessionLogs(now),
		dogs,
		exercises: {
			all: () => [recall],
			get: (id: string) => (id === recall.id ? recall : undefined)
		},
		users,
		uow: directUnitOfWork,
		clock,
		ids,
		logger: silent
	};
	return {
		http: createSessionLogsHttp(createSessionLogs(ports)),
		planner: createPlannerHttp(createPlanner(ports)),
		dog
	};
}

describe('session logs http', () => {
	it('logs ad hoc and answers with the log on the household’s clocks', async () => {
		const { http, dog } = await setup();
		const created = await http.create(viewer, {
			body: { dogId: dog.id, exerciseId: 'recall-basics', notes: 'Good boy' }
		});
		expect(created).toEqual({
			status: 201,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store', etag: '"1"' },
			body: {
				id: expect.any(String),
				dogId: dog.id,
				exercise: { id: 'recall-basics', title: 'Recall basics', minutes: 5 },
				practisedAt: at.toISOString(),
				date: '2026-11-10',
				time: '17:00',
				outcome: 'not_assessed',
				notes: 'Good boy',
				caregiver: 'Sam',
				updatedAt: at.toISOString(),
				updatedBy: 'Sam',
				etag: '"1"'
			}
		});
	});

	it('logs a planned session, which then carries the outcome', async () => {
		const { http, planner, dog } = await setup();
		const session = (
			await planner.create(viewer, {
				body: { dogId: dog.id, exerciseId: 'recall-basics', date: '2026-11-10', time: '16:30' }
			})
		).body as { id: string };
		const created = await http.create(viewer, {
			body: { plannedSessionId: session.id, outcome: 'partial' }
		});
		const log = created.body as { id: string; plannedSessionId: string };
		expect(created.status).toBe(201);
		expect(log.plannedSessionId).toBe(session.id);
		expect((await planner.get(viewer, { id: session.id })).body).toMatchObject({
			status: 'completed',
			log: { id: log.id, outcome: 'partial' }
		});
		expect(await http.create(viewer, { body: { plannedSessionId: session.id } })).toMatchObject({
			status: 409,
			body: { detail: 'This session has already been logged.' }
		});
	});

	it('edits with If-Match and refuses without it or with a stale one', async () => {
		const { http, dog } = await setup();
		const { id } = (
			await http.create(viewer, { body: { dogId: dog.id, exerciseId: 'recall-basics' } })
		).body as { id: string };
		expect(
			await http.update(viewer, { id, ifMatch: null, body: { outcome: 'successful' } })
		).toMatchObject({ status: 428 });
		const updated = await http.update(viewer, {
			id,
			ifMatch: '"1"',
			body: { outcome: 'successful', durationMin: 4 }
		});
		expect(updated).toMatchObject({
			status: 200,
			headers: { etag: '"2"' },
			body: { outcome: 'successful', durationMin: 4 }
		});
		expect(
			await http.update(viewer, { id, ifMatch: '"1"', body: { outcome: 'partial' } })
		).toMatchObject({ status: 412 });
		expect(
			await http.update(viewer, { id, ifMatch: '"2"', body: { colour: 'red' } })
		).toMatchObject({ status: 400 });
	});

	it('answers 404 to another household and to someone with none', async () => {
		const { http, dog } = await setup();
		const { id } = (
			await http.create(viewer, { body: { dogId: dog.id, exerciseId: 'recall-basics' } })
		).body as { id: string };
		expect(await http.get(viewer, { id })).toMatchObject({ status: 200 });
		expect(await http.get(outsider, { id })).toMatchObject({ status: 404 });
		expect(await http.get(noHousehold, { id })).toMatchObject({ status: 404 });
		expect(
			await http.update(outsider, { id, ifMatch: '"1"', body: { outcome: 'successful' } })
		).toMatchObject({ status: 404 });
		expect(
			await http.create(noHousehold, { body: { dogId: dog.id, exerciseId: 'recall-basics' } })
		).toMatchObject({ status: 404 });
	});
});
