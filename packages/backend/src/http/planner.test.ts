import { describe, expect, it } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { createPlanner } from '../application/planner/planner.js';
import type { Exercise } from '../domain/exercise.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { directUnitOfWork, memoryUsers } from '../testing/auth.js';
import { manualClock } from '../testing/clock.js';
import { memoryDogs } from '../testing/dogs.js';
import { memoryPlannedSessions, memoryTrainingPlans } from '../testing/planner.js';
import { createPlannerHttp } from './planner.js';

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
// Tuesday 10 November 2026, 08:00 in Johannesburg.
const at = new Date('2026-11-10T06:00:00Z');

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
	const http = createPlannerHttp(
		createPlanner({
			plans: memoryTrainingPlans(now),
			plannedSessions: memoryPlannedSessions(now),
			dogs,
			exercises: { all: () => [recall], get: (id) => (id === recall.id ? recall : undefined) },
			users,
			uow: directUnitOfWork,
			clock,
			ids,
			logger: silent
		})
	);
	const schedule = async (repeat?: { days: number[] }) =>
		(
			await http.create(viewer, {
				body: {
					dogId: dog.id,
					exerciseId: 'recall-basics',
					date: '2026-11-10',
					time: '17:30',
					repeat
				}
			})
		).body as { id: string; etag: string; plan?: { id: string; etag: string } };
	return { http, dog, schedule };
}

describe('planner http', () => {
	it('schedules a session and answers with it on the household’s clocks', async () => {
		const { http, dog } = await setup();
		const created = await http.create(viewer, {
			body: { dogId: dog.id, exerciseId: 'recall-basics', date: '2026-11-10', time: '17:30' }
		});
		expect(created).toEqual({
			status: 201,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store', etag: '"1"' },
			body: {
				id: expect.any(String),
				dogId: dog.id,
				exercise: { id: 'recall-basics', title: 'Recall basics', minutes: 5 },
				scheduledAt: '2026-11-10T15:30:00.000Z',
				date: '2026-11-10',
				time: '17:30',
				status: 'planned',
				updatedAt: at.toISOString(),
				updatedBy: 'Sam',
				etag: '"1"'
			}
		});
	});

	it('includes the series with its own ETag', async () => {
		const { schedule } = await setup();
		const first = await schedule({ days: [3] });
		expect(first.plan).toEqual({
			id: expect.any(String),
			exerciseId: 'recall-basics',
			startDate: '2026-11-10',
			time: '17:30',
			days: [3],
			etag: '"1"'
		});
	});

	it('lists a range and refuses a missing one', async () => {
		const { http, schedule } = await setup();
		await schedule();
		const listed = await http.list(viewer, { from: '2026-11-09', to: '2026-11-15' });
		expect(listed.status).toBe(200);
		expect((listed.body as { sessions: unknown[] }).sessions).toHaveLength(1);
		expect((await http.list(viewer, { from: null, to: null })).status).toBe(400);
		expect((await http.list(outsider, { from: '2026-11-09', to: '2026-11-15' })).body).toEqual({
			sessions: []
		});
		expect((await http.list(noHousehold, { from: '2026-11-09', to: '2026-11-15' })).status).toBe(
			404
		);
	});

	it('changes a session against its ETag', async () => {
		const { http, schedule } = await setup();
		const { id } = await schedule();
		expect(
			(await http.update(viewer, { id, ifMatch: null, body: { status: 'skipped' } })).status
		).toBe(428);
		const skipped = await http.update(viewer, { id, ifMatch: '"1"', body: { status: 'skipped' } });
		expect(skipped).toMatchObject({
			status: 200,
			headers: { etag: '"2"' },
			body: { status: 'skipped' }
		});
		expect(
			(await http.update(viewer, { id, ifMatch: '"1"', body: { status: 'planned' } })).status
		).toBe(412);
		expect(
			(await http.update(viewer, { id, ifMatch: '"2"', body: { status: 'completed' } })).status
		).toBe(400);
		expect((await http.get(outsider, { id })).status).toBe(404);
	});

	it('changes and ends a series from a session on', async () => {
		const { http, schedule } = await setup();
		const first = await schedule({ days: [3] });
		const plan = first.plan!;
		const changed = await http.updateSeries(viewer, {
			id: plan.id,
			ifMatch: plan.etag,
			body: { fromSessionId: first.id, time: '18:00' }
		});
		expect(changed).toMatchObject({ status: 200, body: { time: '18:00', date: '2026-11-11' } });
		const next = changed.body as { id: string; plan: { id: string; etag: string } };
		// The old series' sessions from there on went with the change.
		const old = { id: plan.id, ifMatch: '"2"', body: { fromSessionId: first.id } };
		expect((await http.endSeries(viewer, old)).status).toBe(404);
		expect(
			(await http.endSeries(viewer, { ...old, id: next.plan.id, body: { fromSessionId: next.id } }))
				.status
		).toBe(412);
		expect(
			await http.endSeries(viewer, {
				id: next.plan.id,
				ifMatch: next.plan.etag,
				body: { fromSessionId: next.id }
			})
		).toMatchObject({ status: 204 });
		expect((await http.get(viewer, { id: next.id })).status).toBe(404);
	});
});
