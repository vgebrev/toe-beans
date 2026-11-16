// Indexes for the training planner (architecture §5.2). Sessions are read by household and time
// (a week, and later Today), and by series from a date. The unique (planId, occurrenceKey) makes
// materialising a series idempotent; one-off sessions have no plan, so it's partial.
import { PLANNED_SESSIONS, TRAINING_PLANS } from '../planner-collections.js';
import type { Migration } from './runner.js';

export const plannerIndexes: Migration = {
	id: '0006-planner',
	async up(db) {
		await db.collection(TRAINING_PLANS).createIndex({ householdId: 1, _id: 1 });
		const sessions = db.collection(PLANNED_SESSIONS);
		await sessions.createIndex({ householdId: 1, scheduledAt: 1 });
		await sessions.createIndex(
			{ planId: 1, occurrenceKey: 1 },
			{ unique: true, partialFilterExpression: { planId: { $type: 'string' } } }
		);
	}
};
