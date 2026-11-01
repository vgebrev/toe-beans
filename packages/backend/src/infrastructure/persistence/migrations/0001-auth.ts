// Indexes for sign-in (architecture §3.4): one user per identity and per verified email, and TTLs
// that clear expired sessions and abandoned sign-ins.
import { PENDING_SIGN_INS, SESSIONS, USERS } from '../auth-collections.js';
import type { Migration } from './runner.js';

export const authIndexes: Migration = {
	id: '0001-auth',
	async up(db) {
		await db.collection(USERS).createIndex({ 'identities.key': 1 }, { unique: true });
		await db.collection(USERS).createIndex({ email: 1 }, { unique: true });
		await db.collection(SESSIONS).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
		// Ending every session of a user (account deletion, "sign out everywhere").
		await db.collection(SESSIONS).createIndex({ userId: 1 });
		await db.collection(PENDING_SIGN_INS).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
	}
};
