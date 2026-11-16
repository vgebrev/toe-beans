// Counting the last day's email invitations, per person, per household and in total (security
// audit F2, architecture D32): every count filters on these two and then reads at most a day's.
import { INVITATIONS } from '../household-collections.js';
import type { Migration } from './runner.js';

export const invitationEmailIndex: Migration = {
	id: '0013-invitation-emails',
	async up(db) {
		await db.collection(INVITATIONS).createIndex({ kind: 1, createdAt: 1 });
	}
};
