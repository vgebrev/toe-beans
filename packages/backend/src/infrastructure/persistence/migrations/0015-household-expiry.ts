// The tick finds households deactivated long enough ago to delete, oldest first (architecture D38).
import { HOUSEHOLDS } from '../household-collections.js';
import type { Migration } from './runner.js';

export const householdExpiryIndex: Migration = {
	id: '0015-household-expiry',
	async up(db) {
		await db.collection(HOUSEHOLDS).createIndex({ 'deactivated.at': 1 }, { sparse: true });
	}
};
