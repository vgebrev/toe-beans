// Indexes for push reminders (architecture §6, D27). A device is found by its endpoint when a
// browser saves it, and by person. The ledger's unique key is what stops a reminder going out
// twice; the tick finds pending and stuck entries by status and time, and its entries go after 30
// days (only the lookback needs them for dedupe). The tick also finds planned sessions across
// households by time.
import { PLANNED_SESSIONS } from '../planner-collections.js';
import { PUSH_DEVICES, REMINDERS } from '../reminder-collections.js';
import type { Migration } from './runner.js';

export const reminderIndexes: Migration = {
	id: '0008-reminders',
	async up(db) {
		const devices = db.collection(PUSH_DEVICES);
		await devices.createIndex({ endpoint: 1 }, { unique: true });
		await devices.createIndex({ userId: 1 });
		const ledger = db.collection(REMINDERS);
		await ledger.createIndex({ key: 1 }, { unique: true });
		await ledger.createIndex({ status: 1, notBefore: 1 });
		await ledger.createIndex({ status: 1, lockedUntil: 1 });
		await ledger.createIndex({ userId: 1, kind: 1, _id: -1 });
		await ledger.createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
		await db.collection(PLANNED_SESSIONS).createIndex({ status: 1, scheduledAt: 1 });
	}
};
