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
