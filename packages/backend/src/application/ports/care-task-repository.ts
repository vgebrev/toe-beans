// Storage for care tasks (architecture §4.4, §5.2, D30). Every method but the tick's takes the
// household, so no call can reach another household's task by ID.
import type { PlainDate } from '../../domain/calendar.js';
import type {
	CareDetails,
	CareHistoryEntry,
	CareStatus,
	CareTask
} from '../../domain/care-task.js';
import type { Id } from '../../domain/id.js';
import type { Result } from '../../domain/result.js';
import type { NotFoundError, StaleVersionError } from '../errors.js';

export type NewCareTask = Omit<CareTask, 'version' | 'createdAt' | 'updatedAt'>;

/** A field set to undefined is removed. */
export type CareTaskChanges = { [K in keyof CareDetails]?: CareDetails[K] } & {
	dogId?: Id;
	status?: CareStatus;
	completedOn?: PlainDate | undefined;
	nextId?: Id | undefined;
	/** The whole history, with the new entries appended. */
	history?: CareHistoryEntry[];
	updatedBy: Id;
};

export interface CareTaskRepository {
	insert(task: NewCareTask): Promise<CareTask>;
	findById(householdId: Id, id: Id): Promise<CareTask | null>;
	/** Applies `changes` if the task is still at `expectedVersion` (NFR-13). */
	update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: CareTaskChanges
	): Promise<Result<CareTask, NotFoundError | StaleVersionError>>;
	/** Upcoming tasks, soonest first; with `until`, only those due by then (Today's *Coming up*). */
	listUpcoming(householdId: Id, options?: { until?: PlainDate }): Promise<CareTask[]>;
	/** Completed and cancelled tasks, latest due first, at most `limit`. */
	listClosed(householdId: Id, limit: number): Promise<CareTask[]>;
	/**
	 * Every household's upcoming tasks due from `from` to `to`, both included. For the reminder
	 * tick only, which works across households (D27).
	 */
	listUpcomingAcrossHouseholds(from: PlainDate, to: PlainDate): Promise<CareTask[]>;
}
