// Indexes for households and invitations (architecture §3.5, §5.2).
import { HOUSEHOLDS, INVITATIONS } from '../household-collections.js';
import type { Migration } from './runner.js';

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

export const householdIndexes: Migration = {
	id: '0002-households',
	async up(db) {
		// A multikey unique index applies across documents, so this is the one-household-per-person
		// rule (D16) and the lookup behind every request. Allowing more later means dropping it.
		await db.collection(HOUSEHOLDS).createIndex({ 'memberships.userId': 1 }, { unique: true });
		await db.collection(INVITATIONS).createIndex({ tokenHash: 1 }, { unique: true });
		await db.collection(INVITATIONS).createIndex({ householdId: 1, expiresAt: 1 });
		// An address needn't be kept for long after its invitation stopped working (NFR-02), and
		// the 30 days let an expired link still say so instead of "not found".
		await db
			.collection(INVITATIONS)
			.createIndex({ expiresAt: 1 }, { expireAfterSeconds: THIRTY_DAYS_S });
	}
};
