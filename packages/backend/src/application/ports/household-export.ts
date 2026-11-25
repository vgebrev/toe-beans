// What the household's export reads and writes (FR-16, architecture D46): every record the
// household holds, and a ZIP to put them in.
import type { BehaviourEvent } from '../../domain/behaviour-event.js';
import type { CareTask } from '../../domain/care-task.js';
import type { Cue } from '../../domain/cue.js';
import type { Dog } from '../../domain/dog.js';
import type { Id } from '../../domain/id.js';
import type { PlannedSession, TrainingPlan } from '../../domain/planner.js';
import type { SessionLog } from '../../domain/session-log.js';

/** Every record of these kinds the household holds, deleted ones still kept included. */
export interface HouseholdRecordSet {
	dogs: Dog[];
	cues: Cue[];
	trainingPlans: TrainingPlan[];
	plannedSessions: PlannedSession[];
	sessionLogs: SessionLog[];
	behaviourEvents: BehaviourEvent[];
	careTasks: CareTask[];
}

/**
 * Reads all of a household's records at once, for its export. The household, its members and
 * their reminder settings come from their own repositories.
 */
export interface HouseholdRecords {
	read(householdId: Id): Promise<HouseholdRecordSet>;
}

/** A file in the ZIP. `open` gives its bytes when its turn comes; null leaves it out. */
export interface ZipEntry {
	/** The path inside the ZIP, with `/` between folders. */
	name: string;
	/** Deflate it: worth it for text, not for photos that are compressed already. */
	compress: boolean;
	open(): Promise<Uint8Array | ReadableStream<Uint8Array> | null>;
}

/** Writes a ZIP as it's read, opening one entry at a time, so photos aren't all held at once. */
export type ZipWriter = (entries: readonly ZipEntry[]) => ReadableStream<Uint8Array>;
