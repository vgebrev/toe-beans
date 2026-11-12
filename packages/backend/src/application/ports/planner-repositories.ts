// Storage for training plans and planned sessions (architecture §4.4, §5.2). Every method takes
// the household, so no call can reach another household's plan or session by ID.
import type { PlainDate } from '../../domain/calendar.js';
import type { Id } from '../../domain/id.js';
import type { PlannedSession, TrainingPlan } from '../../domain/planner.js';
import type { Result } from '../../domain/result.js';
import type { NotFoundError, StaleVersionError } from '../errors.js';

export type NewTrainingPlan = Omit<TrainingPlan, 'version' | 'createdAt' | 'updatedAt'>;
export type NewPlannedSession = Omit<PlannedSession, 'version' | 'createdAt' | 'updatedAt'>;

/** A field set to undefined is removed: `until: undefined` makes a series open-ended. */
export type TrainingPlanChanges = Partial<
	Pick<TrainingPlan, 'exerciseId' | 'time' | 'days' | 'until' | 'paused'>
> & { updatedBy: Id };

export type PlannedSessionChanges = Partial<
	Pick<
		PlannedSession,
		'exerciseId' | 'scheduledAt' | 'status' | 'cancelledWithDog' | 'sessionLogId'
	>
> & { updatedBy: Id };

export interface TrainingPlanRepository {
	insert(plan: NewTrainingPlan): Promise<TrainingPlan>;
	findById(householdId: Id, id: Id): Promise<TrainingPlan | null>;
	findByIds(householdId: Id, ids: readonly Id[]): Promise<TrainingPlan[]>;
	/** Series that can still fall on `date` or later, oldest first. */
	listRunning(householdId: Id, date: PlainDate): Promise<TrainingPlan[]>;
	/** Applies `changes` if the plan is still at `expectedVersion` (NFR-13). */
	update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: TrainingPlanChanges
	): Promise<Result<TrainingPlan, NotFoundError | StaleVersionError>>;
	/** Moves the horizon forward from `from` to `to`, leaving the version alone. False if it had moved. */
	advanceHorizon(householdId: Id, id: Id, from: PlainDate, to: PlainDate): Promise<boolean>;
	/**
	 * Households with a series that's running and not paused but whose sessions stop before
	 * `through`. For the reminder tick only, which works across households (D27).
	 */
	householdsBehind(through: PlainDate): Promise<Id[]>;
}

export interface PlannedSessionRepository {
	insert(session: NewPlannedSession): Promise<PlannedSession>;
	/**
	 * Inserts each series session unless the household already has one for its plan and
	 * occurrence date, so materialising twice adds nothing (architecture §5.2).
	 */
	insertOccurrences(householdId: Id, sessions: readonly NewPlannedSession[]): Promise<void>;
	findById(householdId: Id, id: Id): Promise<PlannedSession | null>;
	/** Scheduled at or after `from` and before `to`, in time order. */
	listBetween(householdId: Id, from: Date, to: Date): Promise<PlannedSession[]>;
	/** The plan's sessions from that occurrence date on, in date order. */
	listFrom(householdId: Id, planId: Id, from: PlainDate): Promise<PlannedSession[]>;
	/** Applies `changes` if the session is still at `expectedVersion` (NFR-13). */
	update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: PlannedSessionChanges
	): Promise<Result<PlannedSession, NotFoundError | StaleVersionError>>;
	/** Cancels every one of the dog's sessions that's still planned, marked as cancelled with it. */
	cancelPlannedFor(householdId: Id, dogId: Id, updatedBy: Id): Promise<number>;
	/** Plans again the dog's sessions cancelled with it that are at `from` or later. */
	restoreFor(householdId: Id, dogId: Id, from: Date, updatedBy: Id): Promise<number>;
	/** Deletes the plan's sessions from that occurrence date on that haven't been logged. */
	deleteUnloggedFrom(householdId: Id, planId: Id, from: PlainDate): Promise<number>;
	/**
	 * Every household's sessions still planned and scheduled at or after `from` and before `to`.
	 * For the reminder tick only, which works across households (D27).
	 */
	listPlannedAcrossHouseholds(from: Date, to: Date): Promise<PlannedSession[]>;
}
