import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import type { NewPlannedSession, NewTrainingPlan } from '../../application/ports/index.js';
import type { PlainDate } from '../../domain/calendar.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { manualClock } from '../../testing/clock.js';
import { householdIsolationSuite } from '../../testing/household-isolation.js';
import { mongoUnitOfWork } from './unit-of-work.js';
import { migrate, migrations } from './migrations/index.js';
import {
	mongoPlannedSessions,
	mongoTrainingPlans,
	PLANNED_SESSIONS,
	TRAINING_PLANS
} from './planner-collections.js';
import { ok } from '../../domain/result.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-10T06:00:00Z');
const clock = manualClock(at);
const d = (s: string) => s as PlainDate;

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const plans = () => mongoTrainingPlans(db.mongo.db, clock);
const sessions = () => mongoPlannedSessions(db.mongo.db, clock);

const newPlan = (householdId: Id, overrides: Partial<NewTrainingPlan> = {}): NewTrainingPlan => ({
	id: ids.next(),
	householdId,
	dogId: ids.next(),
	exerciseId: 'recall-basics',
	startDate: d('2026-11-10'),
	time: '17:30' as never,
	days: [1, 3, 5],
	horizon: d('2026-11-09'),
	updatedBy: ids.next(),
	...overrides
});

const newSession = (
	householdId: Id,
	overrides: Partial<NewPlannedSession> = {}
): NewPlannedSession => ({
	id: ids.next(),
	householdId,
	dogId: ids.next(),
	exerciseId: 'recall-basics',
	scheduledAt: new Date('2026-11-11T15:30:00Z'),
	status: 'planned',
	updatedBy: ids.next(),
	...overrides
});

const occurrences = (householdId: Id, planId: Id, dates: string[]) =>
	dates.map((date) =>
		newSession(householdId, {
			planId,
			occurrenceKey: d(date),
			scheduledAt: new Date(`${date}T15:30:00Z`)
		})
	);

describe('mongoTrainingPlans', () => {
	it('stores a plan and reads it back', async () => {
		const household = ids.next();
		const plan = newPlan(household, { until: d('2026-12-31') });
		const inserted = await plans().insert(plan);
		expect(inserted).toEqual({ ...plan, version: 1, createdAt: at, updatedAt: at });
		expect(await plans().findById(household, plan.id)).toEqual(inserted);
		expect(await plans().findByIds(household, [plan.id, ids.next()])).toEqual([inserted]);
		expect(
			await db.mongo.db.collection(TRAINING_PLANS).findOne({ _id: plan.id as never })
		).toMatchObject({ schemaVersion: 1 });
	});

	it('lists the series still running on a date', async () => {
		const household = ids.next();
		const open = await plans().insert(newPlan(household));
		const later = await plans().insert(newPlan(household, { until: d('2026-11-20') }));
		await plans().insert(newPlan(household, { until: d('2026-11-19') }));
		expect((await plans().listRunning(household, d('2026-11-20'))).map((p) => p.id)).toEqual([
			open.id,
			later.id
		]);
	});

	it('moves the horizon only from where it was, without a new version', async () => {
		const household = ids.next();
		const plan = await plans().insert(newPlan(household));
		clock.advance(1000);
		expect(await plans().advanceHorizon(household, plan.id, d('2026-11-09'), d('2026-12-01'))).toBe(
			true
		);
		expect(await plans().advanceHorizon(household, plan.id, d('2026-11-09'), d('2026-12-02'))).toBe(
			false
		);
		expect(await plans().findById(household, plan.id)).toMatchObject({
			horizon: '2026-12-01',
			version: 1,
			updatedAt: at
		});
		clock.set(at);
	});
});

describe('mongoPlannedSessions', () => {
	it('materialises occurrences once, however often it is asked', async () => {
		const household = ids.next();
		const planId = ids.next();
		await sessions().insertOccurrences(
			household,
			occurrences(household, planId, ['2026-11-11', '2026-11-13'])
		);
		// Again, with new IDs, and one more date: only the new date is added.
		await sessions().insertOccurrences(
			household,
			occurrences(household, planId, ['2026-11-11', '2026-11-13', '2026-11-16'])
		);
		const listed = await sessions().listFrom(household, planId, d('2026-11-01'));
		expect(listed.map((s) => s.occurrenceKey)).toEqual(['2026-11-11', '2026-11-13', '2026-11-16']);
		expect(listed[0]).toMatchObject({ version: 1, status: 'planned', householdId: household });
	});

	it('refuses a second session for the same occurrence of a series', async () => {
		const household = ids.next();
		const [session] = occurrences(household, ids.next(), ['2026-11-11']);
		await sessions().insert(session!);
		await expect(sessions().insert({ ...session!, id: ids.next() })).rejects.toThrow(
			/duplicate key/
		);
		// One-off sessions have no series, so any number can share a time.
		await sessions().insert(newSession(household));
		await sessions().insert(newSession(household));
	});

	it('lists sessions in a time range in order', async () => {
		const household = ids.next();
		const late = await sessions().insert(
			newSession(household, { scheduledAt: new Date('2026-11-12T16:00:00Z') })
		);
		const early = await sessions().insert(
			newSession(household, { scheduledAt: new Date('2026-11-12T05:00:00Z') })
		);
		await sessions().insert(
			newSession(household, { scheduledAt: new Date('2026-11-13T00:00:00Z') })
		);
		const listed = await sessions().listBetween(
			household,
			new Date('2026-11-12T00:00:00Z'),
			new Date('2026-11-13T00:00:00Z')
		);
		expect(listed.map((s) => s.id)).toEqual([early.id, late.id]);
	});

	it('deletes a series’ unlogged sessions from a date on', async () => {
		const household = ids.next();
		const planId = ids.next();
		await sessions().insertOccurrences(
			household,
			occurrences(household, planId, ['2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18'])
		);
		const [, , logged] = await sessions().listFrom(household, planId, d('2026-11-01'));
		await sessions().update(household, logged!.id, 1, {
			status: 'completed',
			updatedBy: ids.next()
		});
		expect(await sessions().deleteUnloggedFrom(ids.next(), planId, d('2026-11-13'))).toBe(0);
		expect(await sessions().deleteUnloggedFrom(household, planId, d('2026-11-13'))).toBe(2);
		const left = await sessions().listFrom(household, planId, d('2026-11-01'));
		expect(left.map((s) => [s.occurrenceKey, s.status])).toEqual([
			['2026-11-11', 'planned'],
			['2026-11-16', 'completed']
		]);
	});

	it('cancels a dog’s planned sessions as an edit, and nothing else', async () => {
		const household = ids.next();
		const dogId = ids.next();
		const who = ids.next();
		const planned = await sessions().insert(newSession(household, { dogId }));
		const skipped = await sessions().insert(newSession(household, { dogId, status: 'skipped' }));
		const otherDog = await sessions().insert(newSession(household));
		const elsewhere = await sessions().insert(newSession(ids.next(), { dogId }));
		clock.advance(1000);
		expect(await sessions().cancelPlannedFor(household, dogId, who)).toBe(1);
		expect(await sessions().findById(household, planned.id)).toMatchObject({
			status: 'cancelled',
			cancelledWithDog: true,
			updatedBy: who,
			version: 2,
			updatedAt: new Date(at.getTime() + 1000)
		});
		expect(await sessions().findById(household, skipped.id)).toEqual(skipped);
		expect(await sessions().findById(household, otherDog.id)).toEqual(otherDog);
		expect(await sessions().findById(elsewhere.householdId, elsewhere.id)).toEqual(elsewhere);
		clock.set(at);
	});

	it('plans again what was cancelled with the dog, from a time on', async () => {
		const household = ids.next();
		const dogId = ids.next();
		const who = ids.next();
		const past = await sessions().insert(
			newSession(household, { dogId, scheduledAt: new Date('2026-11-09T15:30:00Z') })
		);
		const ahead = await sessions().insert(newSession(household, { dogId }));
		const byHand = await sessions().insert(newSession(household, { dogId, status: 'cancelled' }));
		await sessions().cancelPlannedFor(household, dogId, who);
		expect(await sessions().restoreFor(household, dogId, at, who)).toBe(1);
		const back = await sessions().findById(household, ahead.id);
		expect(back).toMatchObject({ status: 'planned', version: 3 });
		expect(back).not.toHaveProperty('cancelledWithDog');
		expect(await sessions().findById(household, past.id)).toMatchObject({ status: 'cancelled' });
		expect(await sessions().findById(household, byHand.id)).toEqual(byHand);
	});

	it('materialises inside a transaction, which a rollback undoes', async () => {
		const household = ids.next();
		const planId = ids.next();
		const uow = mongoUnitOfWork(db.mongo.client);
		const failed = await uow.run(async () => {
			await sessions().insertOccurrences(household, occurrences(household, planId, ['2026-11-11']));
			return { ok: false as const, error: 'nope' };
		});
		expect(failed.ok).toBe(false);
		expect(await sessions().listFrom(household, planId, d('2026-11-01'))).toEqual([]);
		await uow.run(async () => {
			await sessions().insertOccurrences(household, occurrences(household, planId, ['2026-11-11']));
			return ok(undefined);
		});
		expect(await db.mongo.db.collection(PLANNED_SESSIONS).countDocuments({ planId })).toBe(1);
	});
});

householdIsolationSuite('mongoTrainingPlans', () => {
	const repo = plans();
	const version = async (id: Id) =>
		(await db.mongo.db.collection(TRAINING_PLANS).findOne({ _id: id as never }))!.version as number;
	return {
		create: async (householdId) => (await repo.insert(newPlan(householdId))).id,
		read: (householdId, id) => repo.findById(householdId, id),
		list: async (householdId) =>
			(await repo.listRunning(householdId, d('2026-11-10'))).map((p) => p.id),
		update: async (householdId, id) =>
			repo.update(householdId, id, await version(id), { until: d('2026-11-10'), updatedBy: id })
	};
});

householdIsolationSuite('mongoPlannedSessions', () => {
	const repo = sessions();
	const version = async (id: Id) =>
		(await db.mongo.db.collection(PLANNED_SESSIONS).findOne({ _id: id as never }))!
			.version as number;
	return {
		create: async (householdId) => (await repo.insert(newSession(householdId))).id,
		read: (householdId, id) => repo.findById(householdId, id),
		list: async (householdId) =>
			(
				await repo.listBetween(
					householdId,
					new Date('2026-11-01T00:00:00Z'),
					new Date('2026-12-01T00:00:00Z')
				)
			).map((s) => s.id),
		update: async (householdId, id) =>
			repo.update(householdId, id, await version(id), { status: 'cancelled', updatedBy: id })
	};
});
