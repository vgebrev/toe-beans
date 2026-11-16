// Mongo adapter for behaviour events (architecture §3.5, §4.4, §5.2), on HouseholdCollection so
// every call is scoped to the household. Soft-deleted events are filtered out of every read but
// the one that brings an event back (§5.3). Indexes are created by migrations 0009 and 0010, the
// latter with the TTL that purges deleted events.
import type { Db } from 'mongodb';
import type { BehaviourEventRepository, Clock } from '../../application/ports/index.js';
import type { BehaviourEvent } from '../../domain/behaviour-event.js';
import { notFound } from '../../application/errors.js';
import { err, ok } from '../../domain/result.js';
import { HouseholdCollection, type Stored } from './household-collection.js';
import { timelineFilter, timelineSort } from './timeline-filter.js';

export const BEHAVIOUR_EVENTS = 'behaviourEvents';

const EVENT_SCHEMA = 1;

type EventDoc = Stored<BehaviourEvent>;

function toEvent({ _id, schemaVersion: _, ...rest }: EventDoc): BehaviourEvent {
	return { id: _id, ...rest };
}

const live = { deletedAt: { $exists: false } };
const deleted = { deletedAt: { $exists: true } };

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
			const [doc] = await events.find(householdId, { _id: id, ...live });
			return doc ? toEvent(doc) : null;
		},
		async listTimeline(householdId, { categories, ...query }) {
			const docs = await events.find(
				householdId,
				{
					...timelineFilter('occurredAt', query),
					...(categories && { category: { $in: [...categories] } }),
					...live
				},
				{ sort: timelineSort('occurredAt'), limit: query.limit }
			);
			return docs.map(toEvent);
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await events.update(householdId, id, expectedVersion, changes, live);
			return updated.ok ? ok(toEvent(updated.value)) : updated;
		},
		async softDelete(householdId, id, expectedVersion, deletedBy) {
			const changes = { deletedAt: clock.now(), updatedBy: deletedBy };
			const updated = await events.update(householdId, id, expectedVersion, changes, live);
			return updated.ok ? ok(toEvent(updated.value)) : updated;
		},
		async findDeleted(householdId, id) {
			const [doc] = await events.find(householdId, { _id: id, ...deleted });
			return doc ? toEvent(doc) : null;
		},
		async restore(householdId, id, expectedVersion, restoredBy) {
			const [doc] = await events.find(householdId, { _id: id, ...deleted });
			if (!doc) return err(notFound('event'));
			const changes = { deletedAt: undefined, updatedBy: restoredBy };
			const updated = await events.update(householdId, id, expectedVersion, changes, deleted);
			return updated.ok ? ok(toEvent(updated.value)) : updated;
		}
	};
}
