// Mongo adapters for push devices, reminder preferences and the reminder ledger (architecture §6,
// D27). Devices and preferences belong to a person, not a household, so they don't build on
// HouseholdCollection: every method takes the user. The ledger is written by the worker, which
// works across households; people only reach their own entries, by user. Indexes, including the
// ledger's unique key and its 30-day TTL, are created by migration 0008.
import { MongoServerError, type Db } from 'mongodb';
import type {
	Clock,
	PushDeviceRepository,
	ReminderPreferenceRepository,
	ReminderRepository
} from '../../application/ports/index.js';
import type { Id } from '../../domain/id.js';
import type { PushDevice, Reminder, ReminderPreference } from '../../domain/reminders.js';

export const PUSH_DEVICES = 'pushDevices';
export const REMINDER_PREFERENCES = 'reminderPreferences';
export const REMINDERS = 'reminders';

const DEVICE_SCHEMA = 1;
const PREFERENCE_SCHEMA = 1;
const REMINDER_SCHEMA = 1;

type DeviceDoc = Omit<PushDevice, 'id'> & { _id: Id; schemaVersion: number };
type PreferenceDoc = Omit<ReminderPreference, 'userId'> & { _id: Id; schemaVersion: number };
type ReminderDoc = Omit<Reminder, 'id'> & { _id: Id; schemaVersion: number };

const toDevice = ({ _id, schemaVersion: _, ...rest }: DeviceDoc): PushDevice => ({
	id: _id,
	...rest
});
const toPreference = ({ _id, schemaVersion: _, ...rest }: PreferenceDoc): ReminderPreference => ({
	userId: _id,
	...rest
});
const toReminder = ({ _id, schemaVersion: _, ...rest }: ReminderDoc): Reminder => ({
	id: _id,
	...rest
});

const isDuplicateKey = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

export function mongoPushDevices(db: Db, clock: Clock): PushDeviceRepository {
	const devices = db.collection<DeviceDoc>(PUSH_DEVICES);

	async function upsert({ id, endpoint, ...fields }: Parameters<PushDeviceRepository['save']>[0]) {
		const now = clock.now();
		const doc = await devices.findOneAndUpdate(
			{ endpoint },
			{
				$set: { ...fields, failureCount: 0, updatedAt: now },
				$unset: { disabledAt: '' },
				$setOnInsert: { _id: id, endpoint, createdAt: now, schemaVersion: DEVICE_SCHEMA }
			},
			{ upsert: true, returnDocument: 'after' }
		);
		return toDevice(doc!);
	}

	return {
		async save(device) {
			try {
				return await upsert(device);
			} catch (e) {
				// Two saves of a new endpoint at once: one inserted, so the other now updates it.
				if (isDuplicateKey(e)) return upsert(device);
				throw e;
			}
		},
		async listForUser(userId) {
			return (await devices.find({ userId }).sort({ _id: -1 }).toArray()).map(toDevice);
		},
		async findForUser(userId, id) {
			const doc = await devices.findOne({ _id: id, userId });
			return doc && toDevice(doc);
		},
		async listLive(userIds) {
			if (userIds.length === 0) return [];
			const docs = await devices
				.find({ userId: { $in: [...userIds] }, disabledAt: { $exists: false } })
				.toArray();
			return docs.map(toDevice);
		},
		async remove(userId, id) {
			const { deletedCount } = await devices.deleteOne({ _id: id, userId });
			return deletedCount === 1;
		},
		async recordSuccess(id, at) {
			await devices.updateOne({ _id: id }, { $set: { lastSuccessAt: at, failureCount: 0 } });
		},
		async recordFailure(id) {
			await devices.updateOne({ _id: id }, { $inc: { failureCount: 1 } });
		},
		async disable(id, at) {
			await devices.updateOne({ _id: id }, { $set: { disabledAt: at, updatedAt: at } });
		}
	};
}

export function mongoReminderPreferences(db: Db): ReminderPreferenceRepository {
	const prefs = db.collection<PreferenceDoc>(REMINDER_PREFERENCES);
	return {
		async find(userId) {
			const doc = await prefs.findOne({ _id: userId });
			return doc && toPreference(doc);
		},
		async findMany(userIds) {
			if (userIds.length === 0) return [];
			return (await prefs.find({ _id: { $in: [...userIds] } }).toArray()).map(toPreference);
		},
		async save({ userId, ...fields }) {
			const doc = await prefs.findOneAndReplace(
				{ _id: userId },
				{ ...fields, schemaVersion: PREFERENCE_SCHEMA },
				{ upsert: true, returnDocument: 'after' }
			);
			return toPreference(doc!);
		}
	};
}

export function mongoReminders(db: Db, clock: Clock): ReminderRepository {
	const ledger = db.collection<ReminderDoc>(REMINDERS);
	const docOf = ({ id, ...fields }: Parameters<ReminderRepository['insert']>[0]): ReminderDoc => {
		const now = clock.now();
		return { _id: id, ...fields, createdAt: now, updatedAt: now, schemaVersion: REMINDER_SCHEMA };
	};
	return {
		async claimNew(reminder) {
			try {
				await ledger.insertOne(docOf(reminder));
				return true;
			} catch (e) {
				if (isDuplicateKey(e)) return false;
				throw e;
			}
		},
		async insert(reminder) {
			const doc = docOf(reminder);
			await ledger.insertOne(doc);
			return toReminder(doc);
		},
		async existingKeys(keys) {
			if (keys.length === 0) return new Set();
			const docs = await ledger
				.find({ key: { $in: [...keys] } }, { projection: { key: 1 } })
				.toArray();
			return new Set(docs.map((d) => d.key));
		},
		async claimNext(now, claim, lockedUntil) {
			const doc = await ledger.findOneAndUpdate(
				{
					$or: [
						{ status: 'pending', notBefore: { $lte: now } },
						{ status: 'sending', lockedUntil: { $lt: now } }
					]
				},
				{ $set: { status: 'sending', claim, lockedUntil, updatedAt: clock.now() } },
				{ sort: { dueAt: 1 }, returnDocument: 'after' }
			);
			return doc && toReminder(doc);
		},
		async settle(id, claim, outcome) {
			const { notBefore, ...rest } = outcome;
			const { matchedCount } = await ledger.updateOne(
				{ _id: id, claim, status: 'sending' },
				{
					$set: { ...rest, ...(notBefore && { notBefore }), updatedAt: clock.now() },
					$unset: { claim: '', lockedUntil: '', ...(!notBefore && { notBefore: '' }) }
				}
			);
			return matchedCount === 1;
		},
		async latestTest(userId) {
			const [doc] = await ledger
				.find({ userId, kind: 'test' })
				.sort({ _id: -1 })
				.limit(1)
				.toArray();
			return doc ? toReminder(doc) : null;
		},
		async markReceived(userId, id, at) {
			const { matchedCount } = await ledger.updateOne({ _id: id, userId }, [
				{ $set: { receivedAt: { $ifNull: ['$receivedAt', at] } } }
			]);
			return matchedCount === 1;
		}
	};
}
