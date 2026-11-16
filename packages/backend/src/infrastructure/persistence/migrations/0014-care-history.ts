// History lists completed care tasks by the day they were done (architecture D35).
import { CARE_TASKS } from '../care-task-collection.js';
import type { Migration } from './runner.js';

export const careHistoryIndex: Migration = {
	id: '0014-care-history',
	async up(db) {
		await db
			.collection(CARE_TASKS)
			.createIndex({ householdId: 1, status: 1, completedOn: -1, _id: -1 });
	}
};
