// Indexes for care tasks (architecture §5.2, D30). The Care tab and Today read a household's
// tasks by status and date; the reminder tick reads upcoming ones by date across households.
import { CARE_TASKS } from '../care-task-collection.js';
import type { Migration } from './runner.js';

export const careTaskIndexes: Migration = {
	id: '0011-care-tasks',
	async up(db) {
		const tasks = db.collection(CARE_TASKS);
		await tasks.createIndex({ householdId: 1, status: 1, dueDate: 1 });
		await tasks.createIndex({ status: 1, dueDate: 1 });
	}
};
