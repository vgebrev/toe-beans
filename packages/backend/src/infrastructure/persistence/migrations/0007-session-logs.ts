// Indexes for session logs (architecture §5.2). Logs are read by household and when they were
// practised (History and Today, later), and a planned session has at most one log, so two
// caregivers logging it at once can't both complete it.
import { SESSION_LOGS } from '../session-log-collection.js';
import type { Migration } from './runner.js';

export const sessionLogIndexes: Migration = {
	id: '0007-session-logs',
	async up(db) {
		const logs = db.collection(SESSION_LOGS);
		await logs.createIndex({ householdId: 1, practisedAt: -1 });
		await logs.createIndex(
			{ plannedSessionId: 1 },
			{ unique: true, partialFilterExpression: { plannedSessionId: { $type: 'string' } } }
		);
	}
};
