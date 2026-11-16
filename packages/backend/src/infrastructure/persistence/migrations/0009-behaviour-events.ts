// Indexes for behaviour events (architecture §5.2, D28). History (S10) reads them by household
// and when they happened, newest first, and by dog.
import { BEHAVIOUR_EVENTS } from '../behaviour-event-collection.js';
import type { Migration } from './runner.js';

export const behaviourEventIndexes: Migration = {
	id: '0009-behaviour-events',
	async up(db) {
		const events = db.collection(BEHAVIOUR_EVENTS);
		await events.createIndex({ householdId: 1, occurredAt: -1 });
		await events.createIndex({ householdId: 1, dogId: 1, occurredAt: -1 });
	}
};
