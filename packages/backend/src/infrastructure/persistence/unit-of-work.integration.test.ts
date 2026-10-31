import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import { conflictError } from '../../application/errors.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { err, ok } from '../../domain/result.js';
import { manualClock } from '../../testing/clock.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';
import { mongoUnitOfWork } from './unit-of-work.js';

interface CounterDoc extends HouseholdDocument {
	n: number;
}

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const counters = () =>
	new HouseholdCollection<CounterDoc>(db.mongo.db.collection('counters'), {
		resource: 'counter',
		schemaVersion: 1,
		clock: manualClock()
	});

describe('mongoUnitOfWork', () => {
	let household: Id;
	beforeEach(() => {
		household = ids.next();
	});

	const two = async () => {
		const [x, y] = [ids.next(), ids.next()];
		await counters().insert(household, x, { n: 0 });
		return { x, y };
	};
	const ns = async () =>
		(await counters().find(household, {}, { sort: { _id: 1 } })).map((c) => c.n);

	it('commits every write when the work returns ok', async () => {
		const { x, y } = await two();
		const result = await mongoUnitOfWork(db.mongo.client).run(async () => {
			await counters().update(household, x, 1, { n: 1 });
			await counters().insert(household, y, { n: 2 });
			return ok('done');
		});
		expect(result).toEqual({ ok: true, value: 'done' });
		expect(await ns()).toEqual([1, 2]);
	});

	it('rolls back every write when the work returns an error', async () => {
		const { x, y } = await two();
		const result = await mongoUnitOfWork(db.mongo.client).run(async () => {
			await counters().update(household, x, 1, { n: 1 });
			await counters().insert(household, y, { n: 2 });
			return err(conflictError('no'));
		});
		expect(result).toEqual({ ok: false, error: { kind: 'conflict', message: 'no' } });
		expect(await ns()).toEqual([0]);
	});

	it('rolls back and rethrows when the work throws', async () => {
		const { x } = await two();
		const run = mongoUnitOfWork(db.mongo.client).run(async () => {
			await counters().update(household, x, 1, { n: 1 });
			throw new Error('bug');
		});
		await expect(run).rejects.toThrow('bug');
		expect(await ns()).toEqual([0]);
	});

	it('reads its own writes inside the transaction, unseen outside until commit', async () => {
		const { x } = await two();
		const uow = mongoUnitOfWork(db.mongo.client);
		await uow.run(async () => {
			await counters().update(household, x, 1, { n: 5 });
			expect((await counters().findById(household, x))?.n).toBe(5);
			const outside = await db.mongo.db.collection<CounterDoc>('counters').findOne({ _id: x });
			expect(outside?.n).toBe(0);
			return ok(undefined);
		});
	});

	it('joins an outer run, so an inner error rolls back the outer writes too', async () => {
		const { x, y } = await two();
		const uow = mongoUnitOfWork(db.mongo.client);
		await uow.run(async () => {
			await counters().update(household, x, 1, { n: 1 });
			return uow.run(async () => {
				await counters().insert(household, y, { n: 2 });
				return err(conflictError('inner'));
			});
		});
		expect(await ns()).toEqual([0]);
	});
});
