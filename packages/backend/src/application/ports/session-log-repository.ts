// Storage for session logs (architecture §4.4, §5.2). Every method takes the household, so no call
// can reach another household's log by ID. Soft-deleted logs (S10) are never returned.
import type { Id } from '../../domain/id.js';
import type { Result } from '../../domain/result.js';
import type { LogDetails, SessionLog } from '../../domain/session-log.js';
import type { NotFoundError, StaleVersionError } from '../errors.js';

export type NewSessionLog = Omit<SessionLog, 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** A field set to undefined is removed. */
export type SessionLogChanges = { [K in keyof LogDetails]?: LogDetails[K] } & { updatedBy: Id };

export interface SessionLogRepository {
	insert(log: NewSessionLog): Promise<SessionLog>;
	findById(householdId: Id, id: Id): Promise<SessionLog | null>;
	findByIds(householdId: Id, ids: readonly Id[]): Promise<SessionLog[]>;
	/** Practised at or after `from` and before `to`, in time order. */
	listPractisedBetween(householdId: Id, from: Date, to: Date): Promise<SessionLog[]>;
	/** Applies `changes` if the log is still at `expectedVersion` (NFR-13). */
	update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: SessionLogChanges
	): Promise<Result<SessionLog, NotFoundError | StaleVersionError>>;
}
