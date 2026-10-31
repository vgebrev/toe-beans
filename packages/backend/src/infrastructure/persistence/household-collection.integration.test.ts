import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { manualClock } from '../../testing/clock.js';
import { householdIsolationSuite } from '../../testing/household-isolation.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';

interface NoteDoc extends HouseholdDocument {
	text: string;
	pinned?: boolean;
}

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const clock = manualClock('2026-10-31T10:00:00Z');
const notes = () =>
	new HouseholdCollection<NoteDoc>(db.mongo.db.collection('notes'), {
		resource: 'note',
		schemaVersion: 2,
		clock
	});

householdIsolationSuite('HouseholdCollection', () => {
	const repo = notes();
	return {
		create: async (householdId) => (await repo.insert(householdId, ids.next(), { text: 'hi' }))._id,
		read: (householdId, id) => repo.findById(householdId, id),
		list: async (householdId) => (await repo.find(householdId)).map((n) => n._id),
		update: (householdId, id) => repo.update(householdId, id, 1, { text: 'changed' }),
		remove: (householdId, id) => repo.delete(householdId, id, 1)
	};
});

describe('HouseholdCollection', () => {
	let household: Id;
	beforeEach(() => {
		household = ids.next();
		clock.set('2026-10-31T10:00:00Z');
	});

	it('fills in the common fields on insert', async () => {
		const id = ids.next();
		await notes().insert(household, id, { text: 'sit', pinned: undefined });
		expect(await notes().findById(household, id)).toEqual({
			_id: id,
			householdId: household,
			text: 'sit',
			version: 1,
			createdAt: clock.now(),
			updatedAt: clock.now(),
			schemaVersion: 2
		});
	});

	it('bumps the version and updatedAt, and unsets fields set to undefined', async () => {
		const id = ids.next();
		const created = await notes().insert(household, id, { text: 'sit', pinned: true });
		clock.advance(60_000);
		const result = await notes().update(household, id, 1, { text: 'down', pinned: undefined });
		expect(result).toEqual({
			ok: true,
			value: { ...created, text: 'down', pinned: undefined, version: 2, updatedAt: clock.now() }
		});
		expect(await notes().findById(household, id)).not.toHaveProperty('pinned');
	});

	it('rejects a stale version without changing the document', async () => {
		const id = ids.next();
		await notes().insert(household, id, { text: 'sit' });
		await notes().update(household, id, 1, { text: 'down' });
		expect(await notes().update(household, id, 1, { text: 'stay' })).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect(await notes().delete(household, id, 1)).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect((await notes().findById(household, id))?.text).toBe('down');
	});

	it('reports a missing document as not found', async () => {
		expect(await notes().update(household, ids.next(), 1, { text: 'x' })).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'note' }
		});
	});

	it("won't let a filter widen the household", async () => {
		const other = ids.next();
		await notes().insert(other, ids.next(), { text: 'theirs' });
		const filter = { householdId: other } as never;
		expect(await notes().find(household, filter)).toEqual([]);
	});

	it('finds with a filter, sort and limit', async () => {
		for (const text of ['b', 'a', 'c']) await notes().insert(household, ids.next(), { text });
		const found = await notes().find(household, { text: { $ne: 'c' } }, { sort: { text: 1 } });
		expect(found.map((n) => n.text)).toEqual(['a', 'b']);
		expect(await notes().find(household, {}, { limit: 1 })).toHaveLength(1);
	});

	it('deletes at the current version', async () => {
		const id = ids.next();
		await notes().insert(household, id, { text: 'sit' });
		expect(await notes().delete(household, id, 1)).toEqual({ ok: true, value: undefined });
		expect(await notes().findById(household, id)).toBeNull();
	});
});
