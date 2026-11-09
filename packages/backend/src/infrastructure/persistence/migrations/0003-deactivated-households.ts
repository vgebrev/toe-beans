// A deactivated household has no members (architecture D18). Unique multikey indexes treat that as
// one null key, so a second one would collide with the first; the rule only needs to cover people.
import { HOUSEHOLDS } from '../household-collections.js';
import type { Migration } from './runner.js';

export const deactivatedHouseholds: Migration = {
	id: '0003-deactivated-households',
	async up(db) {
		const households = db.collection(HOUSEHOLDS);
		await households.dropIndex('memberships.userId_1');
		await households.createIndex(
			{ 'memberships.userId': 1 },
			{ unique: true, partialFilterExpression: { 'memberships.userId': { $exists: true } } }
		);
		await households.createIndex({ 'deactivated.by': 1 }, { sparse: true });
	}
};
