import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../../test/mongo.js';
import { PLANNED_SESSIONS, TRAINING_PLANS } from '../planner-collections.js';
import { planTimes } from './0012-plan-times.js';

const db = useTestDatabase();

describe('0012-plan-times', () => {
	beforeEach(async () => {
		await db.mongo.db.dropDatabase();
		await db.mongo.db
			.collection(TRAINING_PLANS)
			.insertMany([
				{ _id: 'p1', householdId: 'h1', time: '17:30', days: [1], schemaVersion: 1 } as never,
				{ _id: 'p2', householdId: 'h1', time: '07:00', days: [2], schemaVersion: 1 } as never
			]);
		await db.mongo.db.collection(PLANNED_SESSIONS).insertMany([
			{ _id: 's1', householdId: 'h1', planId: 'p1', occurrenceKey: '2026-11-16', schemaVersion: 1 },
			{ _id: 's2', householdId: 'h1', planId: 'p2', occurrenceKey: '2026-11-17', schemaVersion: 1 },
			{ _id: 's3', householdId: 'h1', schemaVersion: 1 }
		] as never);
	});

	it('gives each plan its times and each key its plan’s time, and is safe to run again', async () => {
		await planTimes.up(db.mongo.db);
		await planTimes.up(db.mongo.db);
		const plans = await db.mongo.db.collection(TRAINING_PLANS).find().sort({ _id: 1 }).toArray();
		expect(plans).toEqual([
			{ _id: 'p1', householdId: 'h1', times: ['17:30'], days: [1], schemaVersion: 2 },
			{ _id: 'p2', householdId: 'h1', times: ['07:00'], days: [2], schemaVersion: 2 }
		]);
		const sessions = await db.mongo.db
			.collection(PLANNED_SESSIONS)
			.find()
			.sort({ _id: 1 })
			.toArray();
		expect(sessions).toEqual([
			{
				_id: 's1',
				householdId: 'h1',
				planId: 'p1',
				occurrenceKey: '2026-11-16T17:30',
				schemaVersion: 2
			},
			{
				_id: 's2',
				householdId: 'h1',
				planId: 'p2',
				occurrenceKey: '2026-11-17T07:00',
				schemaVersion: 2
			},
			{ _id: 's3', householdId: 'h1', schemaVersion: 2 }
		]);
	});
});
