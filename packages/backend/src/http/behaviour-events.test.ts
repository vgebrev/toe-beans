import { describe, expect, it } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import { createBehaviourEvents } from '../application/journal/behaviour-events.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { memoryUsers } from '../testing/auth.js';
import { memoryBehaviourEvents } from '../testing/behaviour-events.js';
import { manualClock } from '../testing/clock.js';
import { memoryDogs } from '../testing/dogs.js';
import { createBehaviourEventsHttp } from './behaviour-events.js';

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
	const events = createBehaviourEvents({
		behaviourEvents: memoryBehaviourEvents(now),
		dogs,
		users,
		clock,
		ids,
		logger: silent
	});
	return { http: createBehaviourEventsHttp(events), dog };
}

describe('behaviour events http', () => {
	it('records an event and answers with it on the household’s clocks', async () => {
		const { http, dog } = await setup();
		const created = await http.create(viewer, {
			body: {
				dogId: dog.id,
				category: 'barking',
				occurredAt: '2026-11-10T14:45:00Z',
				trigger: 'Doorbell'
			}
		});
		expect(created).toEqual({
			status: 201,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store', etag: '"1"' },
			body: {
				id: expect.any(String),
				dogId: dog.id,
				category: 'barking',
				occurredAt: '2026-11-10T14:45:00.000Z',
				date: '2026-11-10',
				time: '16:45',
				trigger: 'Doorbell',
				recordedBy: 'Sam',
				updatedAt: at.toISOString(),
				updatedBy: 'Sam',
				etag: '"1"'
			}
		});
	});

	it('says which fields are missing or wrong', async () => {
		const { http } = await setup();
		expect(await http.create(viewer, { body: {} })).toMatchObject({
			status: 400,
			body: {
				errors: { dogId: ['Choose one of your dogs.'], category: ['Choose what happened.'] }
			}
		});
		expect(await http.create(viewer, { body: { colour: 'red' } })).toMatchObject({ status: 400 });
	});

	it('edits with If-Match and refuses without it or with a stale one', async () => {
		const { http, dog } = await setup();
		const { id } = (await http.create(viewer, { body: { dogId: dog.id, category: 'fear' } }))
			.body as { id: string };
		expect(
			await http.update(viewer, { id, ifMatch: null, body: { category: 'visitor' } })
		).toMatchObject({ status: 428 });
		expect(
			await http.update(viewer, {
				id,
				ifMatch: '"1"',
				body: { category: 'visitor', notes: 'Gran' }
			})
		).toMatchObject({
			status: 200,
			headers: { etag: '"2"' },
			body: { category: 'visitor', notes: 'Gran' }
		});
		expect(
			await http.update(viewer, { id, ifMatch: '"1"', body: { category: 'other' } })
		).toMatchObject({ status: 412 });
	});

	it('answers 404 to another household and to someone with none', async () => {
		const { http, dog } = await setup();
		const { id } = (await http.create(viewer, { body: { dogId: dog.id, category: 'fear' } }))
			.body as { id: string };
		expect(await http.get(viewer, { id })).toMatchObject({ status: 200 });
		expect(await http.get(outsider, { id })).toMatchObject({ status: 404 });
		expect(await http.get(noHousehold, { id })).toMatchObject({ status: 404 });
		expect(
			await http.update(outsider, { id, ifMatch: '"1"', body: { category: 'other' } })
		).toMatchObject({ status: 404 });
		expect(
			await http.create(noHousehold, { body: { dogId: dog.id, category: 'fear' } })
		).toMatchObject({ status: 404 });
		// Another household's dog is just not one of yours.
		expect(
			await http.create(outsider, { body: { dogId: dog.id, category: 'fear' } })
		).toMatchObject({ status: 400, body: { errors: { dogId: ['Choose one of your dogs.'] } } });
	});
});
