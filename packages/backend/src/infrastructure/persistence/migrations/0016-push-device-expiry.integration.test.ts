import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/mongo.js';
import { PUSH_DEVICES } from '../reminder-collections.js';
import { pushDeviceExpiry } from './0016-push-device-expiry.js';

const db = useTestDatabase();
const day = 24 * 60 * 60 * 1000;
const updatedAt = new Date('2026-11-18T10:00:00Z');
const disabledAt = new Date('2026-11-19T10:00:00Z');

describe('0016-push-device-expiry', () => {
	beforeEach(async () => {
		await db.mongo.db.dropDatabase();
		await db.mongo.db.collection(PUSH_DEVICES).insertMany([
			{ _id: 'live', userId: 'u1', endpoint: 'e1', updatedAt, schemaVersion: 1 },
			{ _id: 'stopped', userId: 'u1', endpoint: 'e2', updatedAt, disabledAt, schemaVersion: 1 }
		] as never);
	});

	it('gives every device the full time from now, and is safe to run again', async () => {
		const before = Date.now();
		await pushDeviceExpiry.up(db.mongo.db);
		const after = Date.now();
		await pushDeviceExpiry.up(db.mongo.db);
		const docs = await db.mongo.db.collection(PUSH_DEVICES).find().sort({ _id: 1 }).toArray();
		const [live, stopped] = docs;
		expect(live).toMatchObject({ lastSeenAt: updatedAt, schemaVersion: 2 });
		expect(stopped).toMatchObject({ lastSeenAt: updatedAt, schemaVersion: 2 });
		const within = (d: unknown, days: number) => {
			const t = (d as Date).getTime();
			return t >= before + days * day && t <= after + days * day;
		};
		expect(within(live!.staleAt, 30)).toBe(true);
		expect(within(stopped!.staleAt, 14)).toBe(true);
	});
});
