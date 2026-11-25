// The HouseholdRecords port on Mongo (architecture D46): every document with the household's ID in
// the collections the export covers, through each repository's own mapper, so older document
// shapes read as they do in the app. Every query filters on the household (§4.4). The reads run
// side by side outside any transaction: an export is a copy as of about now, not a snapshot.
import type { Db, Document } from 'mongodb';
import type { HouseholdRecords } from '../../application/ports/index.js';
import type { Id } from '../../domain/id.js';
import { PENDING_SIGN_INS, SESSIONS, USERS } from './auth-collections.js';
import { BEHAVIOUR_EVENTS, toEvent, type EventDoc } from './behaviour-event-collection.js';
import { CARE_TASKS, toTask, type CareDoc } from './care-task-collection.js';
import { CUES, toCue, type CueDoc } from './cue-collection.js';
import { DOGS, toDog, type DogDoc } from './dog-collection.js';
import { HOUSEHOLDS, INVITATIONS } from './household-collections.js';
import {
	PLANNED_SESSIONS,
	TRAINING_PLANS,
	toPlan,
	toSession,
	type PlanDoc,
	type SessionDoc
} from './planner-collections.js';
import { PUSH_DEVICES, REMINDERS, REMINDER_PREFERENCES } from './reminder-collections.js';
import { SESSION_LOGS, toLog, type LogDoc } from './session-log-collection.js';

/**
 * Documents per round trip. The driver decodes each batch in one go, and after the first it asks
 * for up to 16 MB: years of logs in one batch held up the event loop for most of 100 ms.
 */
const READ_BATCH = 500;

/** The collections `read` takes the household's documents from. */
export const EXPORTED_COLLECTIONS = [
	DOGS,
	CUES,
	TRAINING_PLANS,
	PLANNED_SESSIONS,
	SESSION_LOGS,
	BEHAVIOUR_EVENTS,
	CARE_TASKS
] as const;

/**
 * Every other collection, and why the export doesn't read it here. A collection added later must
 * go in one list or the other, or the integration test fails: the export is a decision per
 * collection, never an accident.
 */
export const COLLECTIONS_LEFT_OUT: Readonly<Record<string, string>> = {
	[HOUSEHOLDS]: 'read through its repository',
	[USERS]: "members' names and emails through the user repository; identities never",
	[REMINDER_PREFERENCES]: 'read through its repository, per member',
	[SESSIONS]: 'sign-in sessions: secrets',
	[PENDING_SIGN_INS]: 'sign-ins under way: secrets',
	[INVITATIONS]: "tokens, and the emails of people who aren't members",
	[PUSH_DEVICES]: 'push endpoints and keys: secrets',
	[REMINDERS]: 'the send ledger: how the app works, not what the household recorded',
	_migrations: 'the schema, not data',
	_locks: 'the schema, not data'
};

export function mongoHouseholdRecords(db: Db): HouseholdRecords {
	const all = <T extends Document>(name: string, householdId: Id) =>
		db
			.collection<T>(name)
			.find({ householdId } as never, { sort: { _id: 1 }, batchSize: READ_BATCH })
			.toArray() as Promise<T[]>;
	return {
		async read(householdId) {
			const [dogs, cues, plans, sessions, logs, events, tasks] = await Promise.all([
				all<DogDoc>(DOGS, householdId),
				all<CueDoc>(CUES, householdId),
				all<PlanDoc>(TRAINING_PLANS, householdId),
				all<SessionDoc>(PLANNED_SESSIONS, householdId),
				all<LogDoc>(SESSION_LOGS, householdId),
				all<EventDoc>(BEHAVIOUR_EVENTS, householdId),
				all<CareDoc>(CARE_TASKS, householdId)
			]);
			return {
				dogs: dogs.map(toDog),
				cues: cues.map(toCue),
				trainingPlans: plans.map(toPlan),
				plannedSessions: sessions.map(toSession),
				sessionLogs: logs.map(toLog),
				behaviourEvents: events.map(toEvent),
				careTasks: tasks.map(toTask)
			};
		}
	};
}
