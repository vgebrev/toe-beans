// Mongo adapter for the cue dictionary (architecture §3.5, §4.4), on HouseholdCollection so every
// call is scoped to the household. Indexes are created by migration 0005.
import type { Db } from 'mongodb';
import type { Clock, CueRepository } from '../../application/ports/index.js';
import type { Cue } from '../../domain/cue.js';
import { ok } from '../../domain/result.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';

export const CUES = 'cues';

const CUE_SCHEMA = 1;

type CueDoc = HouseholdDocument &
	Omit<Cue, 'id' | 'householdId' | 'version' | 'createdAt' | 'updatedAt'>;

function toCue({ _id, schemaVersion: _, ...rest }: CueDoc): Cue {
	return { id: _id, ...rest };
}

export function mongoCues(db: Db, clock: Clock): CueRepository {
	const cues = new HouseholdCollection<CueDoc>(db.collection<CueDoc>(CUES), {
		resource: 'cue',
		schemaVersion: CUE_SCHEMA,
		clock
	});
	return {
		async insert({ id, householdId, ...fields }) {
			return toCue(await cues.insert(householdId, id, fields));
		},
		async findById(householdId, id) {
			const doc = await cues.findById(householdId, id);
			return doc && toCue(doc);
		},
		async list(householdId) {
			// UUIDv7 IDs sort by creation time.
			return (await cues.find(householdId, {}, { sort: { _id: 1 } })).map(toCue);
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await cues.update(householdId, id, expectedVersion, changes);
			return updated.ok ? ok(toCue(updated.value)) : updated;
		},
		delete: (householdId, id, expectedVersion) => cues.delete(householdId, id, expectedVersion)
	};
}
