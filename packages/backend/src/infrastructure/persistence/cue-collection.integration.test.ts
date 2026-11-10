import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import type { NewCue } from '../../application/ports/index.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { manualClock } from '../../testing/clock.js';
import { householdIsolationSuite } from '../../testing/household-isolation.js';
import { CUES, mongoCues } from './cue-collection.js';
import { migrate, migrations } from './migrations/index.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-09T08:00:00Z');
const clock = manualClock(at);

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const cues = () => mongoCues(db.mongo.db, clock);

const newCue = (householdId: Id, overrides: Partial<NewCue> = {}): NewCue => ({
	id: ids.next(),
	householdId,
	label: 'Sit',
	meaning: 'Bottom on the floor until released.',
	updatedBy: ids.next(),
	...overrides
});

describe('mongoCues', () => {
	it('stores a cue with the common fields and reads it back', async () => {
		const household = ids.next();
		const cue = newCue(household, { handSignal: 'Palm up' });
		const inserted = await cues().insert(cue);
		expect(inserted).toEqual({ ...cue, version: 1, createdAt: at, updatedAt: at });
		expect(await cues().findById(household, cue.id)).toEqual(inserted);
		expect(await db.mongo.db.collection(CUES).findOne({ _id: cue.id as never })).toMatchObject({
			householdId: household,
			schemaVersion: 1
		});
	});

	it('lists in the order they were added', async () => {
		const household = ids.next();
		const first = await cues().insert(newCue(household, { label: 'Sit' }));
		const second = await cues().insert(newCue(household, { label: 'Down' }));
		expect((await cues().list(household)).map((c) => c.id)).toEqual([first.id, second.id]);
	});

	it('updates at the expected version, removing fields set to undefined', async () => {
		const household = ids.next();
		const cue = await cues().insert(newCue(household, { handSignal: 'Palm up' }));
		const editor = ids.next();
		const updated = await cues().update(household, cue.id, 1, {
			meaning: 'Bottom down.',
			handSignal: undefined,
			updatedBy: editor
		});
		expect(updated).toMatchObject({
			ok: true,
			value: { meaning: 'Bottom down.', updatedBy: editor, version: 2 }
		});
		expect(updated.ok && updated.value).not.toHaveProperty('handSignal');
		expect(
			await cues().update(household, cue.id, 1, { meaning: 'Late', updatedBy: editor })
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
	});

	it('deletes at the expected version only', async () => {
		const household = ids.next();
		const cue = await cues().insert(newCue(household));
		expect(await cues().delete(household, cue.id, 2)).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect(await cues().delete(household, cue.id, 1)).toEqual({ ok: true, value: undefined });
		expect(await cues().findById(household, cue.id)).toBeNull();
		expect(await cues().delete(household, cue.id, 1)).toMatchObject({
			ok: false,
			error: { kind: 'not-found', resource: 'cue' }
		});
	});
});

householdIsolationSuite('mongoCues', () => {
	const repo = cues();
	const version = async (id: Id) =>
		(await db.mongo.db.collection(CUES).findOne({ _id: id as never }))!.version as number;
	return {
		async create(householdId) {
			return (await repo.insert(newCue(householdId))).id;
		},
		read: (householdId, id) => repo.findById(householdId, id),
		list: async (householdId) => (await repo.list(householdId)).map((c) => c.id),
		update: async (householdId, id) =>
			repo.update(householdId, id, await version(id), { meaning: 'Taken', updatedBy: id }),
		remove: async (householdId, id) => repo.delete(householdId, id, await version(id))
	};
});
