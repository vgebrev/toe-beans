// Devices leave by themselves (architecture D43): each gets `lastSeenAt` (when it was last saved)
// and `staleAt`, and a TTL index deletes it then. Existing devices get the full time from now
// rather than from their last use, so nobody's reminders stop at the deploy: a phone in use is
// seen again on its next app open.
import type { Document } from 'mongodb';
import { DEVICE_STOPPED_MS, DEVICE_UNUSED_MS } from '../../../domain/reminders.js';
import { PUSH_DEVICES } from '../reminder-collections.js';
import type { Migration } from './runner.js';

export const pushDeviceExpiry: Migration = {
	id: '0016-push-device-expiry',
	async up(db) {
		const devices = db.collection<Document>(PUSH_DEVICES);
		const now = Date.now();
		const old = { staleAt: { $exists: false } };
		await devices.updateMany({ ...old, disabledAt: { $exists: true } }, [
			{
				$set: {
					lastSeenAt: '$updatedAt',
					staleAt: new Date(now + DEVICE_STOPPED_MS),
					schemaVersion: 2
				}
			}
		]);
		await devices.updateMany(old, [
			{
				$set: {
					lastSeenAt: '$updatedAt',
					staleAt: new Date(now + DEVICE_UNUSED_MS),
					schemaVersion: 2
				}
			}
		]);
		await devices.createIndex({ staleAt: 1 }, { expireAfterSeconds: 0 });
	}
};
