// Storage for behaviour events (architecture §4.4, §5.2). Every method takes the household, so no
// call can reach another household's event by ID. Soft-deleted events (S10) are never returned.
import type { BehaviourEvent, EventDetails } from '../../domain/behaviour-event.js';
import type { Id } from '../../domain/id.js';
import type { Result } from '../../domain/result.js';
import type { NotFoundError, StaleVersionError } from '../errors.js';

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
}
