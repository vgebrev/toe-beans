// Mongo adapter for dogs (architecture §3.5, §4.4), on HouseholdCollection so every call is scoped
// to the household. Indexes are created by migration 0004.
import type { Db } from 'mongodb';
import type { Clock, DogRepository } from '../../application/ports/index.js';
import type { Dog } from '../../domain/dog.js';
import { ok } from '../../domain/result.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';

export const DOGS = 'dogs';

const DOG_SCHEMA = 1;

type DogDoc = HouseholdDocument &
	Omit<Dog, 'id' | 'householdId' | 'version' | 'createdAt' | 'updatedAt'>;

function toDog({ _id, schemaVersion: _, ...rest }: DogDoc): Dog {
	return { id: _id, ...rest };
}

export function mongoDogs(db: Db, clock: Clock): DogRepository {
	const dogs = new HouseholdCollection<DogDoc>(db.collection<DogDoc>(DOGS), {
		resource: 'dog',
		schemaVersion: DOG_SCHEMA,
		clock
	});
	return {
		async insert({ id, householdId, ...fields }) {
			return toDog(await dogs.insert(householdId, id, fields));
		},
		async findById(householdId, id) {
			const doc = await dogs.findById(householdId, id);
			return doc && toDog(doc);
		},
		async list(householdId) {
			// UUIDv7 IDs sort by creation time.
			return (await dogs.find(householdId, {}, { sort: { _id: 1 } })).map(toDog);
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await dogs.update(householdId, id, expectedVersion, changes);
			return updated.ok ? ok(toDog(updated.value)) : updated;
		}
	};
}
