// Storage for behaviour events (architecture §4.4, §5.2). Every method takes the household, so no
// call can reach another household's event by ID. Soft-deleted events are never returned, except
// to bring one back (architecture §5.3).
import type { BehaviourEvent, EventCategory, EventDetails } from '../../domain/behaviour-event.js';
import type { Id } from '../../domain/id.js';
import type { Result } from '../../domain/result.js';
import type { NotFoundError, StaleVersionError } from '../errors.js';
import type { TimelineQuery } from './timeline.js';

export type NewBehaviourEvent = Omit<
	BehaviourEvent,
	'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

/** A field set to undefined is removed. */
export type BehaviourEventChanges = { [K in keyof EventDetails]?: EventDetails[K] } & {
	dogId?: Id;
	updatedBy: Id;
};

export interface BehaviourEventRepository {
	insert(event: NewBehaviourEvent): Promise<BehaviourEvent>;
	findById(householdId: Id, id: Id): Promise<BehaviourEvent | null>;
	/** Applies `changes` if the event is still at `expectedVersion` (NFR-13). */
	update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: BehaviourEventChanges
	): Promise<Result<BehaviourEvent, NotFoundError | StaleVersionError>>;
	/** One page of History, newest first; with `categories`, only those. */
	listTimeline(
		householdId: Id,
		query: TimelineQuery & { categories?: readonly EventCategory[] }
	): Promise<BehaviourEvent[]>;
	/** Marks the event deleted if it's still at `expectedVersion`; reads no longer return it (§5.3). */
	softDelete(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		deletedBy: Id
	): Promise<Result<BehaviourEvent, NotFoundError | StaleVersionError>>;
	/** A soft-deleted event, to bring back. */
	findDeleted(householdId: Id, id: Id): Promise<BehaviourEvent | null>;
	/** Brings a soft-deleted event back if it's still at `expectedVersion`. */
	restore(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		restoredBy: Id
	): Promise<Result<BehaviourEvent, NotFoundError | StaleVersionError>>;
}
