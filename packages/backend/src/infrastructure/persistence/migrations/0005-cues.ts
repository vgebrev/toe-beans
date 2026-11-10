// Indexes for the cue dictionary (architecture §5.2). Every read is by household.
import { CUES } from '../cue-collection.js';
import type { Migration } from './runner.js';

export const cueIndexes: Migration = {
	id: '0005-cues',
	async up(db) {
		await db.collection(CUES).createIndex({ householdId: 1, _id: 1 });
	}
};
