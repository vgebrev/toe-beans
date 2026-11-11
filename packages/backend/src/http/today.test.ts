import { describe, expect, it } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { createPlanner } from '../application/planner/planner.js';
import { createToday } from '../application/today/today.js';
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
import { createTodayHttp } from './today.js';

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
	const planner = createPlanner(ports);
	const sessionLogs = createSessionLogs(ports);
	return {
		http: createTodayHttp(createToday(ports, { planner, sessionLogs })),
		logs: createSessionLogsHttp(sessionLogs),
		planner: createPlannerHttp(planner),
		dog
	};
}

describe('today http', () => {
	it('answers with the day’s sessions and logs on the household’s clocks', async () => {
		const { http, logs, planner, dog } = await setup();
		const schedule = async (time: string) =>
			(
				await planner.create(viewer, {
					body: { dogId: dog.id, exerciseId: 'recall-basics', date: '2026-11-10', time }
				})
			).body as { id: string };
		const missed = await schedule('16:30');
		const evening = await schedule('18:00');
		const skipped = await schedule('19:00');
		await planner.update(viewer, {
			id: skipped.id,
			ifMatch: '"1"',
			body: { status: 'skipped' }
		});
		const logged = (
			await logs.create(viewer, { body: { dogId: dog.id, exerciseId: 'recall-basics' } })
		).body as { id: string };

		const response = await http.get(viewer);
		expect(response).toMatchObject({
			status: 200,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
			body: {
				date: '2026-11-10',
				overdue: [{ id: missed.id, time: '16:30', status: 'planned', dogId: dog.id }],
				planned: [
					{ id: evening.id, time: '18:00', exercise: { title: 'Recall basics', minutes: 5 } }
				],
				done: [{ id: logged.id, time: '17:00', outcome: 'not_assessed', caregiver: 'Sam' }],
				skipped: [{ id: skipped.id, status: 'skipped' }]
			}
		});
	});

	it('is empty for another household', async () => {
		const { http, planner, dog } = await setup();
		await planner.create(viewer, {
			body: { dogId: dog.id, exerciseId: 'recall-basics', date: '2026-11-10', time: '18:00' }
		});
		expect((await http.get(outsider)).body).toEqual({
			date: '2026-11-10',
			overdue: [],
			planned: [],
			done: [],
			skipped: []
		});
	});

	it('is not found without a household', async () => {
		const { http } = await setup();
		expect(await http.get(noHousehold)).toMatchObject({ status: 404 });
	});
});
