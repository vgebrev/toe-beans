// Mongo adapter for behaviour events (architecture §3.5, §4.4, §5.2), on HouseholdCollection so
// every call is scoped to the household. Soft-deleted events (S10) are filtered out of every read.
// Indexes are created by migration 0009.
import type { Db } from 'mongodb';
import type { BehaviourEventRepository, Clock } from '../../application/ports/index.js';
import type { BehaviourEvent } from '../../domain/behaviour-event.js';
import { ok } from '../../domain/result.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';

export const BEHAVIOUR_EVENTS = 'behaviourEvents';

const EVENT_SCHEMA = 1;

type EventDoc = HouseholdDocument &
	Omit<BehaviourEvent, 'id' | 'householdId' | 'version' | 'createdAt' | 'updatedAt'>;

function toEvent({ _id, schemaVersion: _, ...rest }: EventDoc): BehaviourEvent {
	return { id: _id, ...rest };
}

const live = { deletedAt: { $exists: false } };

export function mongoBehaviourEvents(db: Db, clock: Clock): BehaviourEventRepository {
	const events = new HouseholdCollection<EventDoc>(db.collection<EventDoc>(BEHAVIOUR_EVENTS), {
		resource: 'event',
		schemaVersion: EVENT_SCHEMA,
		clock
	});
	return {
		async insert({ id, householdId, ...fields }) {
			return toEvent(await events.insert(householdId, id, fields));
		},
		async findById(householdId, id) {
			const [doc] = await events.find(householdId, { _id: id, ...live } as never);
			return doc ? toEvent(doc) : null;
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await events.update(householdId, id, expectedVersion, changes);
			return updated.ok ? ok(toEvent(updated.value)) : updated;
		}
	};
}
