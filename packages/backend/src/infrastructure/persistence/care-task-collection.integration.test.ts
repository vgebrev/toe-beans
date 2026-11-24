import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import type { NewCareTask } from '../../application/ports/index.js';
import type { PlainDate } from '../../domain/calendar.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { manualClock } from '../../testing/clock.js';
import { householdIsolationSuite } from '../../testing/household-isolation.js';
import { CARE_TASKS, mongoCareTasks } from './care-task-collection.js';
import { migrate, migrations } from './migrations/index.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-10T15:00:00Z');
const clock = manualClock(at);

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const tasks = () => mongoCareTasks(db.mongo.db, clock);

const newTask = (householdId: Id, overrides: Partial<NewCareTask> = {}): NewCareTask => {
	const by = ids.next();
	return {
		id: ids.next(),
		householdId,
		dogId: ids.next(),
		category: 'vaccination',
		title: 'Vaccination',
		dueDate: '2026-11-17' as PlainDate,
		status: 'upcoming',
		history: [{ kind: 'created', due: { date: '2026-11-17' as PlainDate }, at, by }],
		createdBy: by,
		updatedBy: by,
		...overrides
	};
};

describe('mongoCareTasks', () => {
	it('stores a task with the common fields and reads it back', async () => {
		const household = ids.next();
		const task = newTask(household, { notes: 'n' });
		const inserted = await tasks().insert(task);
		expect(inserted).toEqual({ ...task, version: 1, createdAt: at, updatedAt: at });
		expect(await tasks().findById(household, task.id)).toEqual(inserted);
		expect(
			await db.mongo.db.collection(CARE_TASKS).findOne({ _id: task.id as never })
		).toMatchObject({ householdId: household, schemaVersion: 1 });
	});

	it('updates at the expected version, removing fields set to undefined', async () => {
		const household = ids.next();
		const task = await tasks().insert(
			newTask(household, { notes: 'n', dueTime: '09:00' as never })
		);
		const updated = await tasks().update(household, task.id, 1, {
			status: 'cancelled',
			notes: undefined,
			updatedBy: task.createdBy
		});
		expect(updated).toMatchObject({ ok: true, value: { status: 'cancelled', version: 2 } });
		expect(updated.ok && 'notes' in updated.value).toBe(false);
		expect(await tasks().update(household, task.id, 1, { updatedBy: task.createdBy })).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
	});

	it('lists upcoming soonest first (all-day before timed), past latest first, and by date across households', async () => {
		const household = ids.next();
		const other = ids.next();
		const d = (s: string) => s as PlainDate;
		const timed = await tasks().insert(
			newTask(household, { dueDate: d('2026-11-12'), dueTime: '09:00' as never })
		);
		const allDay = await tasks().insert(newTask(household, { dueDate: d('2026-11-12') }));
		const later = await tasks().insert(newTask(household, { dueDate: d('2026-11-30') }));
		const done = await tasks().insert(
			newTask(household, { dueDate: d('2026-11-01'), status: 'completed' })
		);
		const cancelled = await tasks().insert(
			newTask(household, { dueDate: d('2026-11-05'), status: 'cancelled' })
		);
		const theirs = await tasks().insert(newTask(other, { dueDate: d('2026-11-13') }));

		expect((await tasks().listUpcoming(household)).map((t) => t.id)).toEqual([
			allDay.id,
			timed.id,
			later.id
		]);
		expect(
			(await tasks().listUpcoming(household, { until: d('2026-11-12') })).map((t) => t.id)
		).toEqual([allDay.id, timed.id]);
		expect((await tasks().listClosed(household, 10)).map((t) => t.id)).toEqual([
			cancelled.id,
			done.id
		]);
		const across = await tasks().listUpcomingAcrossHouseholds(d('2026-11-12'), d('2026-11-13'));
		expect(across.map((t) => t.id)).toEqual(
			expect.arrayContaining([timed.id, allDay.id, theirs.id])
		);
		expect(across.map((t) => t.id)).not.toContain(later.id);
	});

	it('lists closed tasks changed since an instant, soonest due first', async () => {
		const household = ids.next();
		const d = (s: string) => s as PlainDate;
		const since = new Date('2026-11-10T09:00:00Z');
		clock.set(new Date('2026-11-10T08:00:00Z'));
		await tasks().insert(newTask(household, { status: 'completed' }));
		clock.set(since);
		const done = await tasks().insert(
			newTask(household, { dueDate: d('2026-11-20'), status: 'completed' })
		);
		const cancelled = await tasks().insert(
			newTask(household, { dueDate: d('2026-11-03'), status: 'cancelled' })
		);
		await tasks().insert(newTask(household));
		await tasks().insert(newTask(ids.next(), { status: 'completed' }));
		clock.set(at);

		expect((await tasks().listClosedSince(household, since, 10)).map((t) => t.id)).toEqual([
			cancelled.id,
			done.id
		]);
		expect(await tasks().listClosedSince(household, since, 1)).toHaveLength(1);
	});

	it("lists History's completed tasks by day done, after a cursor, by dog and dates", async () => {
		const household = ids.next();
		const d = (s: string) => s as PlainDate;
		const dog = ids.next();
		const done = (on: string, dogId?: Id) =>
			tasks().insert(
				newTask(household, {
					status: 'completed',
					completedOn: d(on),
					...(dogId && { dogId })
				})
			);
		const a = await done('2026-11-10', dog);
		const b = await done('2026-11-09');
		const c = await done('2026-11-09');
		const e = await done('2026-11-01');
		await tasks().insert(newTask(household, { status: 'cancelled' }));
		await tasks().insert(
			newTask(ids.next(), { status: 'completed', completedOn: d('2026-11-10') })
		);
		const list = async (query: Parameters<ReturnType<typeof tasks>['listCompletedTimeline']>[1]) =>
			(await tasks().listCompletedTimeline(household, query)).map((t) => t.id);
		const [later, earlier] = c.id > b.id ? [c, b] : [b, c];

		expect(await list({ limit: 10 })).toEqual([a.id, later.id, earlier.id, e.id]);
		expect(await list({ limit: 2 })).toEqual([a.id, later.id]);
		expect(await list({ before: { date: d('2026-11-09'), id: later.id }, limit: 10 })).toEqual([
			earlier.id,
			e.id
		]);
		expect(await list({ before: { date: d('2026-11-09') }, limit: 10 })).toEqual([e.id]);
		expect(await list({ dogId: dog, limit: 10 })).toEqual([a.id]);
		expect(await list({ categories: ['vaccination'], limit: 1 })).toEqual([a.id]);
		expect(await list({ categories: ['puppy_school'], limit: 10 })).toEqual([]);
		expect(await list({ from: d('2026-11-02'), to: d('2026-11-09'), limit: 10 })).toEqual([
			later.id,
			earlier.id
		]);
	});
});

householdIsolationSuite('mongoCareTasks', () => ({
	create: async (householdId) => (await tasks().insert(newTask(householdId))).id,
	read: (householdId, id) => tasks().findById(householdId, id),
	list: async (householdId) => (await tasks().listUpcoming(householdId)).map((t) => t.id),
	update: async (householdId, id) => {
		const current = await db.mongo.db.collection(CARE_TASKS).findOne({ _id: id as never });
		return tasks().update(householdId, id, current!.version as number, {
			status: 'cancelled',
			updatedBy: ids.next()
		});
	}
}));

householdIsolationSuite('mongoCareTasks: History', () => ({
	create: async (householdId) =>
		(
			await tasks().insert(
				newTask(householdId, { status: 'completed', completedOn: '2026-11-10' as PlainDate })
			)
		).id,
	read: (householdId, id) => tasks().findById(householdId, id),
	list: async (householdId) =>
		(await tasks().listCompletedTimeline(householdId, { limit: 10 })).map((t) => t.id)
}));
