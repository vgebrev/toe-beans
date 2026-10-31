import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { useTestDatabase } from '../../../../test/mongo.js';
import { systemClock } from '../../system-clock.js';
import { migrate, type Migration } from './runner.js';

const db = useTestDatabase();
const clock = systemClock;

/** Migrations that log their runs and create an index each. */
const recording = (log: string[], ...ids: string[]): Migration[] =>
	ids.map((id) => ({
		id,
		async up(d: Db) {
			log.push(id);
			await d.collection('things').createIndex({ [id]: 1 });
		}
	}));

describe('migrate', () => {
	beforeEach(async () => {
		await db.mongo.db.dropDatabase();
	});

	it('runs pending migrations in order and records them', async () => {
		const log: string[] = [];
		expect(await migrate(db.mongo.db, recording(log, '0001-a', '0002-b'), { clock })).toEqual([
			'0001-a',
			'0002-b'
		]);
		expect(log).toEqual(['0001-a', '0002-b']);
		expect(await db.mongo.db.collection('_migrations').distinct('_id')).toEqual([
			'0001-a',
			'0002-b'
		]);
	});

	it('skips applied migrations and runs new ones', async () => {
		const log: string[] = [];
		await migrate(db.mongo.db, recording(log, '0001-a'), { clock });
		expect(await migrate(db.mongo.db, recording(log, '0001-a', '0002-b'), { clock })).toEqual([
			'0002-b'
		]);
		expect(await migrate(db.mongo.db, recording(log, '0001-a', '0002-b'), { clock })).toEqual([]);
		expect(log).toEqual(['0001-a', '0002-b']);
	});

	it('runs each migration once when instances start together', async () => {
		const log: string[] = [];
		const slow: Migration = {
			id: '0001-slow',
			up: async () => {
				log.push('0001-slow');
				await new Promise((r) => setTimeout(r, 200));
			}
		};
		const results = await Promise.all(
			[1, 2, 3].map(() => migrate(db.mongo.db, [slow], { clock, pollMs: 20 }))
		);
		expect(log).toEqual(['0001-slow']);
		expect(results.flat()).toEqual(['0001-slow']);
		expect(await db.mongo.db.collection('_locks').countDocuments()).toBe(0);
	});

	it('takes over an expired lease from a crashed instance', async () => {
		await db.mongo.db
			.collection<{ _id: string; owner: string; expiresAt: Date }>('_locks')
			.insertOne({ _id: 'migrations', owner: 'crashed', expiresAt: new Date(Date.now() - 1) });
		expect(await migrate(db.mongo.db, recording([], '0001-a'), { clock })).toEqual(['0001-a']);
	});

	it('gives up waiting for a live lease', async () => {
		await db.mongo.db
			.collection<{ _id: string; owner: string; expiresAt: Date }>('_locks')
			.insertOne({ _id: 'migrations', owner: 'other', expiresAt: new Date(Date.now() + 60_000) });
		await expect(
			migrate(db.mongo.db, recording([], '0001-a'), { clock, waitMs: 100, pollMs: 20 })
		).rejects.toThrow(/Timed out/);
	});

	it('releases the lease and records nothing when a migration fails', async () => {
		const failing: Migration = {
			id: '0001-bad',
			up: async () => {
				throw new Error('boom');
			}
		};
		await expect(migrate(db.mongo.db, [failing], { clock })).rejects.toThrow('boom');
		expect(await db.mongo.db.collection('_locks').countDocuments()).toBe(0);
		expect(await db.mongo.db.collection('_migrations').countDocuments()).toBe(0);
	});

	it('refuses migrations out of order', async () => {
		await expect(
			migrate(db.mongo.db, recording([], '0002-b', '0001-a'), { clock })
		).rejects.toThrow(/out of order/);
	});
});
