// Mongo adapter for session logs (architecture §3.5, §4.4, §5.2), on HouseholdCollection so every
// call is scoped to the household. Soft-deleted logs (S10) are filtered out of every read.
// Indexes are created by migration 0007, including the unique planned session a log completes.
import type { Db } from 'mongodb';
import type { Clock, SessionLogRepository } from '../../application/ports/index.js';
import { ok } from '../../domain/result.js';
import type { SessionLog } from '../../domain/session-log.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';

export const SESSION_LOGS = 'sessionLogs';

const LOG_SCHEMA = 1;

type LogDoc = HouseholdDocument &
	Omit<SessionLog, 'id' | 'householdId' | 'version' | 'createdAt' | 'updatedAt'>;

function toLog({ _id, schemaVersion: _, ...rest }: LogDoc): SessionLog {
	return { id: _id, ...rest };
}

const live = { deletedAt: { $exists: false } };

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
			const [doc] = await logs.find(householdId, { _id: id, ...live } as never);
			return doc ? toLog(doc) : null;
		},
		async findByIds(householdId, ids) {
			return (await logs.find(householdId, { _id: { $in: [...ids] }, ...live } as never)).map(
				toLog
			);
		},
		async listPractisedBetween(householdId, from, to) {
			const docs = await logs.find(
				householdId,
				{ practisedAt: { $gte: from, $lt: to }, ...live } as never,
				{ sort: { practisedAt: 1, _id: 1 } }
			);
			return docs.map(toLog);
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await logs.update(householdId, id, expectedVersion, changes);
			return updated.ok ? ok(toLog(updated.value)) : updated;
		}
	};
}
