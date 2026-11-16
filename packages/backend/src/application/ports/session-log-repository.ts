// Storage for session logs (architecture §4.4, §5.2). Every method takes the household, so no call
// can reach another household's log by ID. Soft-deleted logs are never returned, except to bring
// one back (architecture §5.3).
import type { Id } from '../../domain/id.js';
import type { Result } from '../../domain/result.js';
import type { LogDetails, SessionLog } from '../../domain/session-log.js';
import type { NotFoundError, StaleVersionError } from '../errors.js';
import type { TimelineQuery } from './timeline.js';

export type NewSessionLog = Omit<SessionLog, 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** A field set to undefined is removed. */
export type SessionLogChanges = { [K in keyof LogDetails]?: LogDetails[K] } & { updatedBy: Id };

export interface SessionLogRepository {
	insert(log: NewSessionLog): Promise<SessionLog>;
	findById(householdId: Id, id: Id): Promise<SessionLog | null>;
	findByIds(householdId: Id, ids: readonly Id[]): Promise<SessionLog[]>;
	/** Practised at or after `from` and before `to`, in time order. */
	listPractisedBetween(householdId: Id, from: Date, to: Date): Promise<SessionLog[]>;
	/** One page of History, newest first; with `exerciseId`, only that exercise's logs. */
	listTimeline(
		householdId: Id,
		query: TimelineQuery & { exerciseId?: string }
	): Promise<SessionLog[]>;
	/** Applies `changes` if the log is still at `expectedVersion` (NFR-13). */
	update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: SessionLogChanges
	): Promise<Result<SessionLog, NotFoundError | StaleVersionError>>;
	/**
	 * Marks the log deleted if it's still at `expectedVersion`; reads no longer return it, and it
	 * no longer holds its planned session, which can be logged again (§5.3).
	 */
	softDelete(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		deletedBy: Id
	): Promise<Result<SessionLog, NotFoundError | StaleVersionError>>;
	/** A soft-deleted log, to bring back. */
	findDeleted(householdId: Id, id: Id): Promise<SessionLog | null>;
	/** Brings a soft-deleted log back if it's still at `expectedVersion`. */
	restore(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		restoredBy: Id
	): Promise<Result<SessionLog, NotFoundError | StaleVersionError>>;
}
