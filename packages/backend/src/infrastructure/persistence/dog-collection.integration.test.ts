import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import type { NewDog } from '../../application/ports/index.js';
import type { PlainDate } from '../../domain/dog.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { manualClock } from '../../testing/clock.js';
import { householdIsolationSuite } from '../../testing/household-isolation.js';
import { DOGS, mongoDogs } from './dog-collection.js';
import { migrate, migrations } from './migrations/index.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-08T08:00:00Z');
const clock = manualClock(at);

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const dogs = () => mongoDogs(db.mongo.db, clock);

const newDog = (householdId: Id, overrides: Partial<NewDog> = {}): NewDog => ({
	id: ids.next(),
	householdId,
	name: 'Rosie',
	birth: { date: '2026-06-01' as PlainDate, precision: 'month' },
	photo: { photoId: ids.next(), updatedAt: at },
	accent: 0,
	...overrides
});

describe('mongoDogs', () => {
	it('stores a dog with the common fields and reads it back', async () => {
		const household = ids.next();
		const dog = newDog(household, { notes: 'Loves cheese.' });
		const inserted = await dogs().insert(dog);
		expect(inserted).toEqual({ ...dog, version: 1, createdAt: at, updatedAt: at });
		expect(await dogs().findById(household, dog.id)).toEqual(inserted);
		expect(await db.mongo.db.collection(DOGS).findOne({ _id: dog.id as never })).toMatchObject({
			householdId: household,
			schemaVersion: 1
		});
	});

	it('lists in the order they were added', async () => {
		const household = ids.next();
		const first = await dogs().insert(newDog(household, { name: 'Rosie' }));
		const second = await dogs().insert(newDog(household, { name: 'Milo' }));
		expect((await dogs().list(household)).map((d) => d.id)).toEqual([first.id, second.id]);
	});

	it('updates at the expected version, removing fields set to undefined', async () => {
		const household = ids.next();
		const dog = await dogs().insert(newDog(household, { notes: 'Loves cheese.' }));
		const updated = await dogs().update(household, dog.id, 1, {
			name: 'Rosie Posie',
			notes: undefined,
			archivedAt: at
		});
		expect(updated).toMatchObject({
			ok: true,
			value: { name: 'Rosie Posie', archivedAt: at, version: 2 }
		});
		expect(updated.ok && updated.value).not.toHaveProperty('notes');
		expect(await dogs().update(household, dog.id, 1, { name: 'Late' })).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
	});
});

householdIsolationSuite('mongoDogs', () => {
	const repo = dogs();
	return {
		async create(householdId) {
			return (await repo.insert(newDog(householdId))).id;
		},
		read: (householdId, id) => repo.findById(householdId, id),
		list: async (householdId) => (await repo.list(householdId)).map((d) => d.id),
		async update(householdId, id) {
			const current = await db.mongo.db.collection(DOGS).findOne({ _id: id as never });
			return repo.update(householdId, id, current!.version as number, { name: 'Taken' });
		}
	};
});
