// Mongo adapter for session logs (architecture §3.5, §4.4, §5.2), on HouseholdCollection so every
// call is scoped to the household. Soft-deleted logs are filtered out of every read but the one
// that brings a log back (§5.3). Indexes are created by migrations 0007, including the unique
// planned session a log completes, and 0010, including the TTL that purges deleted logs.
//
// A deleted log keeps its planned session under `deletedPlannedSessionId`, out of the unique
// index, so the session can be logged again; restoring puts it back.
import type { Db } from 'mongodb';
import type { Clock, SessionLogRepository } from '../../application/ports/index.js';
import { notFound } from '../../application/errors.js';
import type { Id } from '../../domain/id.js';
import { err, ok } from '../../domain/result.js';
import type { SessionLog } from '../../domain/session-log.js';
import { HouseholdCollection, type Stored } from './household-collection.js';
import { timelineFilter, timelineSort } from './timeline-filter.js';

export const SESSION_LOGS = 'sessionLogs';

const LOG_SCHEMA = 1;

export type LogDoc = Stored<SessionLog> & { deletedPlannedSessionId?: Id };

export function toLog({
	_id,
	schemaVersion: _,
	deletedPlannedSessionId,
	...rest
}: LogDoc): SessionLog {
	return {
		id: _id,
		...rest,
		...(deletedPlannedSessionId && { plannedSessionId: deletedPlannedSessionId })
	};
}

const live = { deletedAt: { $exists: false } };
const deleted = { deletedAt: { $exists: true } };

export function mongoSessionLogs(db: Db, clock: Clock): SessionLogRepository {
	const logs = new HouseholdCollection<LogDoc>(db.collection<LogDoc>(SESSION_LOGS), {
		resource: 'log',
		schemaVersion: LOG_SCHEMA,
		clock
	});
	return {
		async insert({ id, householdId, ...fields }) {
			return toLog(await logs.insert(householdId, id, fields));
		},
		async findById(householdId, id) {
			const [doc] = await logs.find(householdId, { _id: id, ...live });
			return doc ? toLog(doc) : null;
		},
		async findByIds(householdId, ids) {
			return (await logs.find(householdId, { _id: { $in: [...ids] }, ...live })).map(toLog);
		},
		async listPractisedBetween(householdId, from, to) {
			const docs = await logs.find(
				householdId,
				{ practisedAt: { $gte: from, $lt: to }, ...live },
				{ sort: { practisedAt: 1, _id: 1 } }
			);
			return docs.map(toLog);
		},
		async listTimeline(householdId, { exerciseId, ...query }) {
			const docs = await logs.find(
				householdId,
				{
					...timelineFilter('practisedAt', query),
					...(exerciseId && { exerciseId }),
					...live
				},
				{ sort: timelineSort('practisedAt'), limit: query.limit }
			);
			return docs.map(toLog);
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await logs.update(householdId, id, expectedVersion, changes, live);
			return updated.ok ? ok(toLog(updated.value)) : updated;
		},
		async softDelete(householdId, id, expectedVersion, deletedBy) {
			const [doc] = await logs.find(householdId, { _id: id, ...live });
			if (!doc) return err(notFound('log'));
			const updated = await logs.update(
				householdId,
				id,
				expectedVersion,
				{
					deletedAt: clock.now(),
					updatedBy: deletedBy,
					...(doc.plannedSessionId && {
						plannedSessionId: undefined,
						deletedPlannedSessionId: doc.plannedSessionId
					})
				},
				live
			);
			return updated.ok ? ok(toLog(updated.value)) : updated;
		},
		async findDeleted(householdId, id) {
			const [doc] = await logs.find(householdId, { _id: id, ...deleted });
			return doc ? toLog(doc) : null;
		},
		async restore(householdId, id, expectedVersion, restoredBy) {
			const [doc] = await logs.find(householdId, { _id: id, ...deleted });
			if (!doc) return err(notFound('log'));
			const updated = await logs.update(
				householdId,
				id,
				expectedVersion,
				{
					deletedAt: undefined,
					updatedBy: restoredBy,
					...(doc.deletedPlannedSessionId && {
						plannedSessionId: doc.deletedPlannedSessionId,
						deletedPlannedSessionId: undefined
					})
				},
				deleted
			);
			return updated.ok ? ok(toLog(updated.value)) : updated;
		}
	};
}
