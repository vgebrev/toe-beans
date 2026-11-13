import { describe, expect, it } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { createCareTasks } from '../application/care/care-tasks.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { directUnitOfWork, memoryUsers } from '../testing/auth.js';
import { memoryCareTasks } from '../testing/care-tasks.js';
import { manualClock } from '../testing/clock.js';
import { memoryDogs } from '../testing/dogs.js';
import { createCareTasksHttp } from './care-tasks.js';

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
	const care = createCareTasks({
		careTasks: memoryCareTasks(now),
		dogs,
		users,
		uow: directUnitOfWork,
		clock,
		ids,
		logger: silent
	});
	return { http: createCareTasksHttp(care, clock), dog };
}

describe('care tasks http', () => {
	it('adds a task and answers with it, its history and ETag', async () => {
		const { http, dog } = await setup();
		const created = await http.create(viewer, {
			body: { dogId: dog.id, category: 'vaccination', dueDate: '2026-11-17', dueTime: '09:30' }
		});
		expect(created).toMatchObject({
			status: 201,
			headers: { etag: '"1"' },
			body: {
				dogId: dog.id,
				category: 'vaccination',
				title: 'Vaccination',
				dueDate: '2026-11-17',
				dueTime: '09:30',
				status: 'upcoming',
				overdue: false,
				history: [
					{
						kind: 'created',
						due: { date: '2026-11-17', time: '09:30' },
						at: at.toISOString(),
						by: 'Sam'
					}
				],
				createdBy: 'Sam',
				updatedBy: 'Sam',
				etag: '"1"'
			}
		});
	});

	it('lists without history, marking overdue ones', async () => {
		const { http, dog } = await setup();
		await http.create(viewer, {
			body: { dogId: dog.id, category: 'vaccination', dueDate: '2026-11-09' }
		});
		const list = await http.list(viewer);
		expect(list).toMatchObject({
			status: 200,
			body: { upcoming: [{ overdue: true }], closed: [] }
		});
		expect((list.body as { upcoming: object[] }).upcoming[0]).not.toHaveProperty('history');
	});

	it('changes and completes with If-Match, and refuses without it', async () => {
		const { http, dog } = await setup();
		const { id } = (
			await http.create(viewer, {
				body: { dogId: dog.id, category: 'vaccination', dueDate: '2026-11-10' }
			})
		).body as { id: string };
		expect(await http.update(viewer, { id, ifMatch: null, body: { notes: 'x' } })).toMatchObject({
			status: 428
		});
		expect(
			await http.update(viewer, { id, ifMatch: '"1"', body: { status: 'done' } })
		).toMatchObject({ status: 400 });
		const done = await http.complete(viewer, {
			id,
			ifMatch: '"1"',
			body: { next: { dueDate: '2026-12-10' } }
		});
		expect(done).toMatchObject({
			status: 200,
			headers: { etag: '"2"' },
			body: { status: 'completed', completedOn: '2026-11-10', nextId: expect.any(String) }
		});
		expect(await http.complete(viewer, { id, ifMatch: '"1"', body: {} })).toMatchObject({
			status: 412
		});
		expect(await http.complete(viewer, { id, ifMatch: '"2"', body: {} })).toMatchObject({
			status: 409
		});
	});

	it('is a 404 for another household and for someone with none (scenario 9)', async () => {
		const { http, dog } = await setup();
		const { id } = (
			await http.create(viewer, {
				body: { dogId: dog.id, category: 'vaccination', dueDate: '2026-11-17' }
			})
		).body as { id: string };
		expect(await http.get(outsider, { id })).toMatchObject({ status: 404 });
		expect(
			await http.update(outsider, { id, ifMatch: '"1"', body: { status: 'cancelled' } })
		).toMatchObject({ status: 404 });
		expect(await http.complete(outsider, { id, ifMatch: '"1"', body: {} })).toMatchObject({
			status: 404
		});
		expect(await http.list(noHousehold)).toMatchObject({ status: 404 });
		expect((await http.list(outsider)).body).toEqual({ upcoming: [], closed: [] });
	});
});
