import { describe, expect, it } from 'vitest';
import { createIdGenerator, type Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { directUnitOfWork, memoryUsers } from '../../testing/auth.js';
import { memoryCareTasks } from '../../testing/care-tasks.js';
import { manualClock } from '../../testing/clock.js';
import { memoryDogs } from '../../testing/dogs.js';
import type { PlannerContext } from '../auth/auth.js';
import { createCareTasks } from './care-tasks.js';
import { silentLogger } from '../../testing/logger.js';

// Tuesday 10 November 2026, 17:00 in Johannesburg.
const at = new Date('2026-11-10T15:00:00Z');
const person = (id: string, displayName: string): User => ({
	id: id as Id,
	identities: [],
	email: `${id}@example.com`,
	displayName,
	displayNameSource: 'user',
	version: 1,
	createdAt: at,
	updatedAt: at
});
const ctx = (userId: string, householdId = 'h1'): PlannerContext => ({
	userId: userId as Id,
	householdId: householdId as Id,
	role: 'caregiver',
	timeZone: 'Africa/Johannesburg'
});
const sam = ctx('sam');
const alex = ctx('alex');
const outsider = ctx('out', 'h9');

async function setup() {
	const clock = manualClock(at);
	const now = () => clock.now();
	const users = memoryUsers();
	for (const u of [person('sam', 'Sam'), person('alex', 'Alex')]) await users.insert(u);
	const ids = createIdGenerator(() => now().getTime());
	const dogs = memoryDogs(now);
	const dog = (name: string, householdId = 'h1', archivedAt?: Date) =>
		dogs.insert({
			id: ids.next(),
			householdId: householdId as Id,
			name,
			photo: { photoId: ids.next(), updatedAt: at },
			accent: 0,
			...(archivedAt && { archivedAt })
		});
	const ripley = await dog('Ripley');
	const miso = await dog('Miso');
	const old = await dog('Old', 'h1', at);
	const theirs = await dog('Theirs', 'h9');
	const careTasks = memoryCareTasks(now);
	const care = createCareTasks({
		careTasks,
		dogs,
		users,
		uow: directUnitOfWork,
		clock,
		ids,
		logger: silentLogger
	});
	const add = async (
		dueDate: string,
		extra: { dogId?: Id; dueTime?: string; category?: string; who?: PlannerContext } = {}
	) => {
		const { who = sam, ...rest } = extra;
		const made = await care.create(who, {
			dogId: ripley.id,
			category: 'vaccination',
			dueDate,
			...rest
		});
		if (!made.ok) throw new Error(JSON.stringify(made.error));
		return made.value.task;
	};
	return { clock, care, careTasks, dogs, ripley, miso, old, theirs, add };
}

describe('adding a care task (scenario 7)', () => {
	it('is upcoming, titled after its category unless given one, with who added it', async () => {
		const { care, ripley } = await setup();
		const created = await care.create(sam, {
			dogId: ripley.id,
			category: 'vaccination',
			dueDate: '2026-11-17',
			dueTime: '09:30',
			notes: 'Second puppy shot'
		});
		expect(created).toEqual({
			ok: true,
			value: {
				task: {
					id: expect.any(String),
					householdId: 'h1',
					dogId: ripley.id,
					category: 'vaccination',
					title: 'Vaccination',
					dueDate: '2026-11-17',
					dueTime: '09:30',
					notes: 'Second puppy shot',
					status: 'upcoming',
					history: [{ kind: 'created', due: { date: '2026-11-17', time: '09:30' }, at, by: 'sam' }],
					createdBy: 'sam',
					updatedBy: 'sam',
					version: 1,
					createdAt: at,
					updatedAt: at
				},
				names: { sam: 'Sam' }
			}
		});
		const titled = await care.create(sam, {
			dogId: ripley.id,
			category: 'other',
			title: '  Nail   trim ',
			dueDate: '2026-11-10'
		});
		expect(titled).toMatchObject({ ok: true, value: { task: { title: 'Nail trim' } } });
	});

	it('needs a current dog, a category and a date, and says which are missing', async () => {
		const { care, old, theirs } = await setup();
		expect(await care.create(sam, {})).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The care task is not valid.',
				fields: {
					category: ['Choose what kind of care it is.'],
					dueDate: ['Choose a date.'],
					dogId: ['Choose one of your dogs.']
				}
			}
		});
		for (const dogId of [old.id, theirs.id, 'not-an-id']) {
			const made = await care.create(sam, {
				dogId,
				category: 'vaccination',
				dueDate: '2026-11-17'
			});
			expect(made).toMatchObject({ ok: false, error: { fields: { dogId: expect.any(Array) } } });
		}
	});

	it('takes dates from a year back to two years ahead, and times in 5-minute steps', async () => {
		const { care, ripley } = await setup();
		const tryDue = (dueDate: string, dueTime?: string) =>
			care.create(sam, {
				dogId: ripley.id,
				category: 'vet_appointment',
				dueDate,
				...(dueTime && { dueTime })
			});
		expect((await tryDue('2025-11-09')).ok).toBe(true);
		expect((await tryDue('2028-11-10')).ok).toBe(true);
		expect(await tryDue('2025-11-08')).toMatchObject({
			error: { fields: { dueDate: ['Choose a date within the last year.'] } }
		});
		expect(await tryDue('2028-11-11')).toMatchObject({
			error: { fields: { dueDate: ['Choose a date within two years.'] } }
		});
		expect(await tryDue('2026-02-30')).toMatchObject({
			error: { fields: { dueDate: ['Choose a date.'] } }
		});
		expect(await tryDue('2026-11-17', '09:32')).toMatchObject({
			error: { fields: { dueTime: ['Choose a time in 5-minute steps.'] } }
		});
	});
});

describe('changing a care task', () => {
	it('records a new date as a reschedule, keeping who and when (FR-10)', async () => {
		const { care, add, clock } = await setup();
		const task = await add('2026-11-17');
		clock.set('2026-11-11T08:00:00Z');
		const moved = await care.update(alex, {
			id: task.id,
			expectedVersion: 1,
			changes: { dueDate: '2026-11-19', dueTime: '14:00', notes: 'Bring the card' }
		});
		expect(moved).toMatchObject({
			ok: true,
			value: {
				task: {
					dueDate: '2026-11-19',
					dueTime: '14:00',
					notes: 'Bring the card',
					updatedBy: 'alex',
					version: 2,
					history: [
						{ kind: 'created' },
						{
							kind: 'rescheduled',
							from: { date: '2026-11-17' },
							due: { date: '2026-11-19', time: '14:00' },
							by: 'alex',
							at: new Date('2026-11-11T08:00:00Z')
						}
					]
				},
				names: { sam: 'Sam', alex: 'Alex' }
			}
		});
	});

	it('leaves the history alone when only the details change, and can move it to another current dog', async () => {
		const { care, add, miso, old } = await setup();
		const task = await add('2026-11-17');
		const edited = await care.update(sam, {
			id: task.id,
			expectedVersion: 1,
			changes: { title: 'Rabies booster', dogId: miso.id }
		});
		expect(edited).toMatchObject({
			ok: true,
			value: { task: { title: 'Rabies booster', dogId: miso.id, history: [{ kind: 'created' }] } }
		});
		expect(
			await care.update(sam, { id: task.id, expectedVersion: 2, changes: { dogId: old.id } })
		).toMatchObject({ ok: false, error: { fields: { dogId: ['Choose one of your dogs.'] } } });
	});

	it('cancels and puts back, in the history; a done task reopens but can’t be cancelled', async () => {
		const { care, add } = await setup();
		const task = await add('2026-11-17');
		const cancelled = await care.update(sam, {
			id: task.id,
			expectedVersion: 1,
			changes: { status: 'cancelled' }
		});
		expect(cancelled).toMatchObject({ ok: true, value: { task: { status: 'cancelled' } } });
		const back = await care.update(sam, {
			id: task.id,
			expectedVersion: 2,
			changes: { status: 'upcoming' }
		});
		expect(back).toMatchObject({ ok: true, value: { task: { status: 'upcoming' } } });
		await care.complete(sam, { id: task.id, expectedVersion: 3, completedOn: '2026-11-09' });
		expect(
			await care.update(sam, { id: task.id, expectedVersion: 4, changes: { status: 'cancelled' } })
		).toMatchObject({ ok: false, error: { kind: 'conflict' } });
		const reopened = await care.update(sam, {
			id: task.id,
			expectedVersion: 4,
			changes: { status: 'upcoming' }
		});
		expect(reopened.ok && reopened.value.task).toMatchObject({ status: 'upcoming', version: 5 });
		expect(reopened.ok && reopened.value.task.completedOn).toBeUndefined();
		expect(reopened.ok && reopened.value.task.history.map((h) => h.kind)).toEqual([
			'created',
			'cancelled',
			'reopened',
			'completed',
			'reopened'
		]);
	});

	it('refuses a stale version, and another household’s task looks missing (NFR-13, scenario 9)', async () => {
		const { care, add } = await setup();
		const task = await add('2026-11-17');
		await care.update(sam, { id: task.id, expectedVersion: 1, changes: { notes: 'x' } });
		expect(
			await care.update(alex, { id: task.id, expectedVersion: 1, changes: { notes: 'y' } })
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
		expect(await care.get(outsider, task.id)).toMatchObject({
			ok: false,
			error: { kind: 'not-found' }
		});
		expect(
			await care.update(outsider, { id: task.id, expectedVersion: 2, changes: { notes: 'z' } })
		).toMatchObject({ ok: false, error: { kind: 'not-found' } });
		expect(await care.complete(outsider, { id: task.id, expectedVersion: 2 })).toMatchObject({
			ok: false,
			error: { kind: 'not-found' }
		});
	});
});

describe('completing a care task', () => {
	it('marks it done today by default', async () => {
		const { care, add } = await setup();
		const task = await add('2026-11-10');
		const done = await care.complete(alex, { id: task.id, expectedVersion: 1 });
		expect(done).toMatchObject({
			ok: true,
			value: {
				task: {
					status: 'completed',
					completedOn: '2026-11-10',
					updatedBy: 'alex',
					history: [{ kind: 'created' }, { kind: 'completed', on: '2026-11-10', by: 'alex' }]
				}
			}
		});
	});

	it('plans the next one for the same dog, category and title, in the same step', async () => {
		const { care, careTasks, add, miso } = await setup();
		const task = await add('2026-11-08', { dogId: miso.id, category: 'parasite_prevention' });
		await care.update(sam, {
			id: task.id,
			expectedVersion: 1,
			changes: { notes: 'Half a tablet' }
		});
		const done = await care.complete(sam, {
			id: task.id,
			expectedVersion: 2,
			completedOn: '2026-11-09',
			next: { dueDate: '2026-12-09' }
		});
		expect(done.ok).toBe(true);
		const nextId = done.ok ? done.value.task.nextId : undefined;
		expect(nextId).toEqual(expect.any(String));
		const next = careTasks.all().find((t) => t.id === nextId);
		expect(next).toMatchObject({
			dogId: miso.id,
			category: 'parasite_prevention',
			title: 'Parasite prevention',
			dueDate: '2026-12-09',
			status: 'upcoming'
		});
		expect(next?.notes).toBeUndefined();
	});

	it('checks the day it was done and the next date, saving nothing on a mistake', async () => {
		const { care, careTasks, add } = await setup();
		const task = await add('2026-11-10');
		expect(
			await care.complete(sam, { id: task.id, expectedVersion: 1, completedOn: '2026-11-11' })
		).toMatchObject({
			error: { fields: { completedOn: ["Choose today or a day that's passed."] } }
		});
		expect(
			await care.complete(sam, {
				id: task.id,
				expectedVersion: 1,
				completedOn: '2026-11-09',
				next: { dueDate: '2026-11-09' }
			})
		).toMatchObject({
			error: { fields: { 'next.dueDate': ['Choose a date after the day it was done.'] } }
		});
		expect(
			await care.complete(sam, {
				id: task.id,
				expectedVersion: 1,
				next: { dueDate: '2026-12-10', dueTime: '9:00' }
			})
		).toMatchObject({ error: { fields: { 'next.dueTime': ['Choose a time.'] } } });
		expect(careTasks.all()).toHaveLength(1);
		expect(careTasks.all()[0]).toMatchObject({ status: 'upcoming', version: 1 });
	});

	it('says so when it’s already done or was cancelled', async () => {
		const { care, add } = await setup();
		const done = await add('2026-11-10');
		await care.complete(sam, { id: done.id, expectedVersion: 1 });
		expect(await care.complete(alex, { id: done.id, expectedVersion: 2 })).toEqual({
			ok: false,
			error: { kind: 'conflict', message: 'This task is already done.' }
		});
		const cancelled = await add('2026-11-10');
		await care.update(sam, {
			id: cancelled.id,
			expectedVersion: 1,
			changes: { status: 'cancelled' }
		});
		expect(await care.complete(alex, { id: cancelled.id, expectedVersion: 2 })).toEqual({
			ok: false,
			error: { kind: 'conflict', message: 'This task was cancelled.' }
		});
	});
});

describe('the care list and Today’s Coming up', () => {
	it('lists upcoming soonest first and past latest first, without archived dogs’ tasks', async () => {
		const { care, add, dogs, miso, old } = await setup();
		const later = await add('2026-11-20');
		const timed = await add('2026-11-12', { dueTime: '09:00' });
		const allDay = await add('2026-11-12');
		const misos = await add('2026-11-11', { dogId: miso.id });
		const past = await add('2026-11-01');
		await care.complete(sam, { id: past.id, expectedVersion: 1 });
		// Archive Miso after adding hers: they wait, untouched (D30).
		const m = await dogs.findById('h1' as Id, miso.id);
		await dogs.update('h1' as Id, miso.id, m!.version, { archivedAt: at });
		void old;

		const list = await care.list(sam);
		expect(list.upcoming.map((v) => v.task.id)).toEqual([allDay.id, timed.id, later.id]);
		expect(list.closed.map((v) => v.task.id)).toEqual([past.id]);
		expect((await care.get(sam, misos.id)).ok).toBe(true);
		expect((await care.list(outsider)).upcoming).toEqual([]);
	});

	it('Coming up holds overdue tasks and those due within 7 days', async () => {
		const { care, add } = await setup();
		const overdue = await add('2026-11-02');
		const today = await add('2026-11-10');
		const week = await add('2026-11-17');
		await add('2026-11-18');
		const coming = await care.comingUp(sam, '2026-11-10' as never);
		expect(coming.map((v) => v.task.id)).toEqual([overdue.id, today.id, week.id]);
	});
});
