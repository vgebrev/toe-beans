import { describe, expect, it } from 'vitest';
import { createIdGenerator, type Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { memoryUsers } from '../../testing/auth.js';
import { memoryBehaviourEvents } from '../../testing/behaviour-events.js';
import { manualClock } from '../../testing/clock.js';
import { memoryDogs } from '../../testing/dogs.js';
import type { PlannerContext } from '../planner/planner.js';
import { createBehaviourEvents } from './behaviour-events.js';

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
	role: 'caregiver',
	timeZone: 'Africa/Johannesburg'
});
const sam = ctx('sam');
const alex = ctx('alex');
const outsider = ctx('out', 'h9');

async function setup() {
	const clock = manualClock(at);
	const now = () => clock.now();
	const users = memoryUsers();
	for (const u of [person('sam', 'Sam'), person('alex', 'Alex')]) await users.insert(u);
	const ids = createIdGenerator(() => now().getTime());
	const dogs = memoryDogs(now);
	const dog = (name: string, householdId = 'h1', archivedAt?: Date) =>
		dogs.insert({
			id: ids.next(),
			householdId: householdId as Id,
			name,
			photo: { photoId: ids.next(), updatedAt: at },
			accent: 0,
			...(archivedAt && { archivedAt })
		});
	const ripley = await dog('Ripley');
	const miso = await dog('Miso');
	const old = await dog('Old', 'h1', at);
	const theirs = await dog('Theirs', 'h9');
	const behaviourEvents = memoryBehaviourEvents(now);
	const events = createBehaviourEvents({
		behaviourEvents,
		dogs,
		users,
		clock,
		ids,
		logger: silent
	});
	return { clock, events, behaviourEvents, ripley, miso, old, theirs };
}

describe('recording an event', () => {
	it('records what happened now, with who recorded it (scenario 6: no session needed)', async () => {
		const { events, ripley } = await setup();
		const created = await events.create(sam, {
			dogId: ripley.id,
			category: 'barking',
			trigger: 'Doorbell',
			response: 'Barked three times, came when called'
		});
		expect(created).toEqual({
			ok: true,
			value: {
				event: {
					id: expect.any(String),
					householdId: 'h1',
					dogId: ripley.id,
					category: 'barking',
					occurredAt: at,
					trigger: 'Doorbell',
					response: 'Barked three times, came when called',
					recordedBy: 'sam',
					updatedBy: 'sam',
					version: 1,
					createdAt: at,
					updatedAt: at
				},
				recordedByName: 'Sam',
				updatedByName: 'Sam'
			}
		});
	});

	it("needs one of the household's current dogs and a category", async () => {
		const { events, old, theirs } = await setup();
		for (const dogId of [undefined, 'nope', old.id, theirs.id]) {
			expect(await events.create(sam, { dogId, category: 'fear' })).toMatchObject({
				ok: false,
				error: { kind: 'validation', fields: { dogId: ['Choose one of your dogs.'] } }
			});
		}
		expect(await events.create(sam, {})).toMatchObject({
			error: {
				fields: { dogId: ['Choose one of your dogs.'], category: ['Choose what happened.'] }
			}
		});
	});
});

describe('changing an event', () => {
	async function recorded() {
		const s = await setup();
		const created = await s.events.create(sam, {
			dogId: s.ripley.id,
			category: 'barking',
			notes: 'At the gate'
		});
		if (!created.ok) throw new Error('not recorded');
		return { ...s, event: created.value.event };
	}

	it('changes the details and the dog, saying who changed it', async () => {
		const { events, event, miso } = await recorded();
		const updated = await events.update(alex, {
			id: event.id,
			expectedVersion: 1,
			changes: {
				dogId: miso.id,
				category: 'visitor',
				notes: null,
				occurredAt: '2026-11-10T14:00:00Z'
			}
		});
		expect(updated).toMatchObject({
			ok: true,
			value: {
				event: {
					dogId: miso.id,
					category: 'visitor',
					occurredAt: new Date('2026-11-10T14:00:00Z'),
					recordedBy: 'sam',
					updatedBy: 'alex',
					version: 2
				},
				recordedByName: 'Sam',
				updatedByName: 'Alex'
			}
		});
		expect(updated.ok && 'notes' in updated.value.event).toBe(false);
	});

	it('keeps an archived dog it already has, but moves to no archived or unknown dog', async () => {
		const { events, event, old, theirs, behaviourEvents } = await recorded();
		for (const dogId of [old.id, theirs.id, 'nope']) {
			expect(
				await events.update(sam, { id: event.id, expectedVersion: 1, changes: { dogId } })
			).toMatchObject({ error: { fields: { dogId: ['Choose one of your dogs.'] } } });
		}
		expect(behaviourEvents.all()[0]!.version).toBe(1);
	});

	it('refuses a stale version, and another household gets not found', async () => {
		const { events, event } = await recorded();
		await events.update(sam, { id: event.id, expectedVersion: 1, changes: { category: 'fear' } });
		expect(
			await events.update(alex, {
				id: event.id,
				expectedVersion: 1,
				changes: { category: 'other' }
			})
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
		expect(await events.get(outsider, event.id)).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'event' }
		});
		expect(
			await events.update(outsider, { id: event.id, expectedVersion: 2, changes: {} })
		).toEqual({ ok: false, error: { kind: 'not-found', resource: 'event' } });
		expect(await events.get(sam, 'not-an-id')).toMatchObject({ ok: false });
	});

	it('names a member who has left as a former member', async () => {
		const { events, event } = await recorded();
		await events.update(ctx('gone'), { id: event.id, expectedVersion: 1, changes: {} });
		expect(await events.get(sam, event.id)).toMatchObject({
			value: { recordedByName: 'Sam', updatedByName: 'A former member' }
		});
	});
});

describe('deleting an event', () => {
	it('soft-deletes against its version, and brings it back', async () => {
		const { events, behaviourEvents, ripley } = await setup();
		const created = await events.create(sam, { dogId: ripley.id, category: 'fear' });
		if (!created.ok) throw new Error(JSON.stringify(created.error));
		const id = created.value.event.id;

		expect(await events.remove(alex, { id, expectedVersion: 2 })).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect(await events.remove(alex, { id, expectedVersion: 1 })).toMatchObject({
			ok: true,
			value: { id, version: 2, updatedBy: 'alex' }
		});
		expect(await events.get(sam, id)).toMatchObject({ ok: false, error: { kind: 'not-found' } });
		expect(behaviourEvents.all()[0]!.deletedAt).toEqual(at);

		expect(await events.restore(alex, { id, expectedVersion: 1 })).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		const restored = await events.restore(alex, { id, expectedVersion: 2 });
		expect(restored).toMatchObject({
			ok: true,
			value: { event: { id, version: 3 }, updatedByName: 'Alex' }
		});
		expect((await events.get(sam, id)).ok).toBe(true);
	});

	it('refuses another household and an unknown ID as not found', async () => {
		const { events, ripley } = await setup();
		const created = await events.create(sam, { dogId: ripley.id, category: 'fear' });
		if (!created.ok) throw new Error(JSON.stringify(created.error));
		const id = created.value.event.id;
		const notFound = { ok: false, error: { kind: 'not-found', resource: 'event' } };
		expect(await events.remove(outsider, { id, expectedVersion: 1 })).toEqual(notFound);
		expect(await events.remove(sam, { id: 'nope', expectedVersion: 1 })).toEqual(notFound);
		await events.remove(sam, { id, expectedVersion: 1 });
		expect(await events.restore(outsider, { id, expectedVersion: 2 })).toEqual(notFound);
	});
});
