// Indexes for dogs (architecture §5.2). Every read is by household, and lists sort by ID.
import { DOGS } from '../dog-collection.js';
import type { Migration } from './runner.js';

export const dogIndexes: Migration = {
	id: '0004-dogs',
	async up(db) {
		await db.collection(DOGS).createIndex({ householdId: 1, _id: 1 });
	}
};
