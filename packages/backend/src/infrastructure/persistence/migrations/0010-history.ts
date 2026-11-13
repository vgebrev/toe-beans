// History (architecture §5.1, §5.3, FR-09). Logs are read by dog too, newest first, as events
// already are (0009). Soft-deleted logs and events are purged 30 days after deletion by a TTL
// index, which only touches documents that have `deletedAt`.
import { BEHAVIOUR_EVENTS } from '../behaviour-event-collection.js';
import { SESSION_LOGS } from '../session-log-collection.js';
import type { Migration } from './runner.js';

export const PURGE_AFTER_SECONDS = 30 * 24 * 60 * 60;

export const historyIndexes: Migration = {
	id: '0010-history',
	async up(db) {
		const logs = db.collection(SESSION_LOGS);
		await logs.createIndex({ householdId: 1, dogId: 1, practisedAt: -1 });
		await logs.createIndex({ deletedAt: 1 }, { expireAfterSeconds: PURGE_AFTER_SECONDS });
		await db
			.collection(BEHAVIOUR_EVENTS)
			.createIndex({ deletedAt: 1 }, { expireAfterSeconds: PURGE_AFTER_SECONDS });
	}
};
