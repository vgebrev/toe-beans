import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import type { NewBehaviourEvent } from '../../application/ports/index.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { err } from '../../domain/result.js';
import { manualClock } from '../../testing/clock.js';
import { householdIsolationSuite } from '../../testing/household-isolation.js';
import { BEHAVIOUR_EVENTS, mongoBehaviourEvents } from './behaviour-event-collection.js';
import { migrate, migrations } from './migrations/index.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-10T15:00:00Z');
const clock = manualClock(at);

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const events = () => mongoBehaviourEvents(db.mongo.db, clock);

const newEvent = (
	householdId: Id,
	overrides: Partial<NewBehaviourEvent> = {}
): NewBehaviourEvent => ({
	id: ids.next(),
	householdId,
	dogId: ids.next(),
	category: 'barking',
	occurredAt: at,
	recordedBy: ids.next(),
	updatedBy: ids.next(),
	...overrides
});

describe('mongoBehaviourEvents', () => {
	it('stores an event with the common fields and reads it back', async () => {
		const household = ids.next();
		const event = newEvent(household, { trigger: 'Doorbell', response: 'Barked' });
		const inserted = await events().insert(event);
		expect(inserted).toEqual({ ...event, version: 1, createdAt: at, updatedAt: at });
		expect(await events().findById(household, event.id)).toEqual(inserted);
		expect(
			await db.mongo.db.collection(BEHAVIOUR_EVENTS).findOne({ _id: event.id as never })
		).toMatchObject({ householdId: household, schemaVersion: 1 });
	});

	it('updates at the expected version, removing fields set to undefined', async () => {
		const household = ids.next();
		const event = await events().insert(newEvent(household, { notes: 'n' }));
		const editor = ids.next();
		const dogId = ids.next();
		const updated = await events().update(household, event.id, 1, {
			dogId,
			category: 'visitor',
			notes: undefined,
			updatedBy: editor
		});
		expect(updated).toMatchObject({
			ok: true,
			value: { dogId, category: 'visitor', updatedBy: editor, version: 2 }
		});
		expect(updated.ok && 'notes' in updated.value).toBe(false);
		expect(await events().update(household, event.id, 1, { updatedBy: editor })).toEqual(
			err({ kind: 'stale-version' })
		);
	});

	it('hides soft-deleted events', async () => {
		const household = ids.next();
		const event = await events().insert(newEvent(household));
		await db.mongo.db
			.collection(BEHAVIOUR_EVENTS)
			.updateOne({ _id: event.id as never }, { $set: { deletedAt: at } });
		expect(await events().findById(household, event.id)).toBeNull();
	});
	it('lists a page of the timeline, newest first, after a cursor and by dog and category', async () => {
		const household = ids.next();
		const dog = ids.next();
		const minutes = (m: number) => new Date(+at - m * 60_000);
		const a = await events().insert(newEvent(household, { dogId: dog, occurredAt: minutes(1) }));
		const b = await events().insert(
			newEvent(household, { occurredAt: minutes(2), category: 'fear' })
		);
		const c = await events().insert(newEvent(household, { dogId: dog, occurredAt: minutes(3) }));
		const list = async (query: Parameters<ReturnType<typeof events>['listTimeline']>[1]) =>
			(await events().listTimeline(household, query)).map((e) => e.id);
		expect(await list({ limit: 10 })).toEqual([a.id, b.id, c.id]);
		expect(await list({ limit: 1, before: { at: a.occurredAt, id: a.id } })).toEqual([b.id]);
		expect(await list({ dogId: dog, limit: 10 })).toEqual([a.id, c.id]);
		expect(await list({ categories: ['fear'], limit: 10 })).toEqual([b.id]);
		expect(await list({ from: minutes(3), to: minutes(1), limit: 10 })).toEqual([b.id, c.id]);
	});

	it('soft-deletes and restores at the expected version', async () => {
		const household = ids.next();
		const by = ids.next();
		const event = await events().insert(newEvent(household));
		expect(await events().softDelete(household, event.id, 2, by)).toEqual(
			err({ kind: 'stale-version' })
		);
		expect(await events().softDelete(household, event.id, 1, by)).toMatchObject({
			ok: true,
			value: { deletedAt: at, updatedBy: by, version: 2 }
		});
		expect(await events().findById(household, event.id)).toBeNull();
		expect(await events().listTimeline(household, { limit: 10 })).toEqual([]);
		expect(await events().findDeleted(ids.next(), event.id)).toBeNull();
		expect(await events().restore(ids.next(), event.id, 2, by)).toEqual(
			err({ kind: 'not-found', resource: 'event' })
		);
		const restored = await events().restore(household, event.id, 2, by);
		expect(restored).toMatchObject({ ok: true, value: { version: 3 } });
		expect(restored.ok && 'deletedAt' in restored.value).toBe(false);
		expect(await events().findById(household, event.id)).not.toBeNull();
	});

	it('purges deleted events 30 days after deletion', async () => {
		const indexes = await db.mongo.db.collection(BEHAVIOUR_EVENTS).indexes();
		expect(indexes.find((i) => i.key.deletedAt === 1)).toMatchObject({
			expireAfterSeconds: 30 * 24 * 60 * 60
		});
	});
});

householdIsolationSuite('mongoBehaviourEvents', () => ({
	create: async (householdId) => (await events().insert(newEvent(householdId))).id,
	read: (householdId, id) => events().findById(householdId, id),
	update: async (householdId, id) => {
		const current = await db.mongo.db.collection(BEHAVIOUR_EVENTS).findOne({ _id: id as never });
		return events().update(householdId, id, current!.version as number, {
			category: 'fear',
			updatedBy: ids.next()
		});
	}
}));

householdIsolationSuite('mongoBehaviourEvents: timeline and delete', () => ({
	create: async (householdId) => (await events().insert(newEvent(householdId))).id,
	read: (householdId, id) => events().findById(householdId, id),
	list: async (householdId) =>
		(await events().listTimeline(householdId, { limit: 10 })).map((e) => e.id),
	remove: async (householdId, id) => {
		const current = await db.mongo.db.collection(BEHAVIOUR_EVENTS).findOne({ _id: id as never });
		return events().softDelete(householdId, id, current!.version as number, ids.next());
	}
}));
