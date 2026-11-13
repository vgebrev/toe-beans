// What History's timeline asks each source for (architecture §5.1 read models, FR-09): one page,
// newest first, ordered by when it happened and then by ID, so a cursor never skips or repeats
// an entry that shares its time with another.
import type { Id } from '../../domain/id.js';

/** The last entry of the page before: the next page starts after it. */
export interface TimelineCursor {
	at: Date;
	id: Id;
}

export interface TimelineQuery {
	dogId?: Id;
	/** At or after. */
	from?: Date;
	/** Before. */
	to?: Date;
	before?: TimelineCursor;
	limit: number;
}
