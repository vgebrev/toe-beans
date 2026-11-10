// Storage for the cue dictionary (architecture §4.4). Every method takes the household, so no call
// can reach another household's cue by ID.
import type { Cue, CueDetails } from '../../domain/cue.js';
import type { Id } from '../../domain/id.js';
import type { Result } from '../../domain/result.js';
import type { NotFoundError, StaleVersionError } from '../errors.js';

export type NewCue = Omit<Cue, 'version' | 'createdAt' | 'updatedAt'>;

/** A field set to undefined is removed: `handSignal: undefined` forgets the hand signal. */
export type CueChanges = { [K in keyof CueDetails]?: CueDetails[K] } & { updatedBy: Id };

export interface CueRepository {
	insert(cue: NewCue): Promise<Cue>;
	findById(householdId: Id, id: Id): Promise<Cue | null>;
	/** In the order they were added. */
	list(householdId: Id): Promise<Cue[]>;
	/** Applies `changes` if the cue is still at `expectedVersion` (NFR-13). */
	update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: CueChanges
	): Promise<Result<Cue, NotFoundError | StaleVersionError>>;
	/** Deletes the cue if it's still at `expectedVersion`. */
	delete(
		householdId: Id,
		id: Id,
		expectedVersion: number
	): Promise<Result<void, NotFoundError | StaleVersionError>>;
}
