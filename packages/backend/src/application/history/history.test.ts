import { describe, expect, it } from 'vitest';
import type { EventCategory } from '../../domain/behaviour-event.js';
import type { PlainDate } from '../../domain/calendar.js';
import type { CareStatus } from '../../domain/care-task.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { memoryUsers } from '../../testing/auth.js';
import { memoryBehaviourEvents } from '../../testing/behaviour-events.js';
import { memoryCareTasks } from '../../testing/care-tasks.js';
import { manualClock } from '../../testing/clock.js';
import { memorySessionLogs } from '../../testing/session-logs.js';
import { createCareTasks } from '../care/care-tasks.js';
import { createBehaviourEvents } from '../journal/behaviour-events.js';
import type { PlannerContext } from '../auth/auth.js';
import { createSessionLogs } from '../training-log/session-logs.js';
import { careAt, createHistory, decodeCursor, encodeCursor, type HistoryEntry } from './history.js';

// Tuesday 10 November 2026, 17:00 in Johannesburg.
const at = new Date('2026-11-10T15:00:00Z');
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const sam: PlannerContext = {
	userId: 'sam' as Id,
	householdId: 'h1' as Id,
	role: 'owner',
	timeZone: 'Africa/Johannesburg'
};
const person: User = {
	id: 'sam' as Id,
	identities: [],
	email: 'sam@example.com',
	displayName: 'Sam',
	displayNameSource: 'user',
	version: 1,
	createdAt: at,
	updatedAt: at
};
const hours = (h: number) => new Date(at.getTime() + h * 3_600_000);

async function setup() {
	const clock = manualClock(at);
	const now = () => clock.now();
	const ids = createIdGenerator(() => now().getTime());
	const users = memoryUsers();
	await users.insert(person);
	const sessionLogs = memorySessionLogs(now);
	const behaviourEvents = memoryBehaviourEvents(now);
	const careTasks = memoryCareTasks(now);
	const exercises = { all: () => [], get: () => undefined };
	const ports = {
		sessionLogs,
		behaviourEvents,
		careTasks,
		users,
		exercises,
		clock,
		ids,
		logger: silent
	} as never;
	const history = createHistory(
		{ sessionLogs, behaviourEvents, careTasks },
		{
			sessionLogs: createSessionLogs(ports),
			behaviourEvents: createBehaviourEvents(ports),
			careTasks: createCareTasks(ports)
		}
	);
	const ripley = ids.next();
	const miso = ids.next();

	const logAt = (when: Date, dogId = ripley, exerciseId = 'recall-basics', householdId = 'h1') =>
		sessionLogs.insert({
			id: ids.next(),
			householdId: householdId as Id,
			dogId,
			exerciseId,
			exerciseContentVersion: 1,
			caregiverId: 'sam' as Id,
			updatedBy: 'sam' as Id,
			practisedAt: when,
			outcome: 'not_assessed'
		});
	const eventAt = (when: Date, dogId = ripley, category: EventCategory = 'barking') =>
		behaviourEvents.insert({
			id: ids.next(),
			householdId: 'h1' as Id,
			dogId,
			category,
			occurredAt: when,
			recordedBy: 'sam' as Id,
			updatedBy: 'sam' as Id
		});
	const careDone = (
		on: string,
		dogId = ripley,
		status: CareStatus = 'completed',
		householdId = 'h1'
	) =>
		careTasks.insert({
			id: ids.next(),
			householdId: householdId as Id,
			dogId,
			category: 'vaccination',
			title: 'Vaccination',
			dueDate: on as PlainDate,
			status,
			...(status === 'completed' && { completedOn: on as PlainDate }),
			history: [
				{ kind: 'created', due: { date: on as PlainDate }, at, by: 'sam' as Id },
				...(status === 'completed'
					? [{ kind: 'completed' as const, on: on as PlainDate, at, by: 'sam' as Id }]
					: [])
			],
			createdBy: 'sam' as Id,
			updatedBy: 'sam' as Id
		});
	return { history, sessionLogs, behaviourEvents, ripley, miso, logAt, eventAt, careDone };
}

const idsOf = (entries: HistoryEntry[]) =>
	entries.map((e) =>
		e.kind === 'training' ? e.view.log.id : e.kind === 'event' ? e.view.event.id : e.view.task.id
	);

describe('the history timeline', () => {
	it('merges logs and events, newest first, with names', async () => {
		const { history, logAt, eventAt } = await setup();
		const a = await logAt(hours(-3));
		const b = await eventAt(hours(-2));
		const c = await logAt(hours(-1));
		const page = await history.list(sam, {});
		if (!page.ok) throw new Error(JSON.stringify(page.error));
		expect(idsOf(page.value.entries)).toEqual([c.id, b.id, a.id]);
		expect(page.value.next).toBeUndefined();
		expect(page.value.entries[0]).toMatchObject({
			kind: 'training',
			view: { caregiverName: 'Sam' }
		});
		expect(page.value.entries[1]).toMatchObject({ kind: 'event', view: { recordedByName: 'Sam' } });
	});

	it('pages with a cursor, never skipping or repeating entries at the same time', async () => {
		const { history, logAt, eventAt } = await setup();
		const made = [];
		for (let i = 0; i < 4; i++) {
			made.push(await logAt(hours(-1)));
			made.push(await eventAt(hours(-1)));
		}
		made.push(await logAt(hours(-5)));
		const seen: string[] = [];
		let cursor: string | undefined;
		for (let round = 0; round < 5; round++) {
			const page = await history.list(sam, { cursor }, 3);
			if (!page.ok) throw new Error(JSON.stringify(page.error));
			seen.push(...idsOf(page.value.entries));
			cursor = page.value.next;
			if (!cursor) break;
		}
		expect(seen).toHaveLength(9);
		expect(new Set(seen).size).toBe(9);
		expect(seen.at(-1)).toBe(made.at(-1)!.id);
	});

	it('filters by dog, type, category and exercise', async () => {
		const { history, logAt, eventAt, ripley, miso } = await setup();
		const ripleyLog = await logAt(hours(-1), ripley);
		const misoLog = await logAt(hours(-2), miso, 'sit');
		const barking = await eventAt(hours(-3), miso, 'barking');
		const fear = await eventAt(hours(-4), ripley, 'fear');
		const list = async (filter: Parameters<typeof history.list>[1]) => {
			const page = await history.list(sam, filter);
			if (!page.ok) throw new Error(JSON.stringify(page.error));
			return idsOf(page.value.entries);
		};
		expect(await list({ dogId: miso })).toEqual([misoLog.id, barking.id]);
		expect(await list({ type: 'training' })).toEqual([ripleyLog.id, misoLog.id]);
		expect(await list({ type: 'events' })).toEqual([barking.id, fear.id]);
		expect(await list({ type: 'fear' })).toEqual([fear.id]);
		expect(await list({ exerciseId: 'sit' })).toEqual([misoLog.id]);
		expect(await list({ exerciseId: 'sit', type: 'events' })).toEqual([]);
	});

	it('filters by dates on the household clocks, both ends included', async () => {
		const { history, logAt } = await setup();
		// 23:30 on the 8th and 00:30 on the 9th in Johannesburg (UTC+2).
		const late = await logAt(new Date('2026-11-08T21:30:00Z'));
		const early = await logAt(new Date('2026-11-08T22:30:00Z'));
		const tenth = await logAt(new Date('2026-11-10T08:00:00Z'));
		const page = await history.list(sam, { from: '2026-11-09', to: '2026-11-09' });
		expect(page.ok && idsOf(page.value.entries)).toEqual([early.id]);
		const open = await history.list(sam, { to: '2026-11-08' });
		expect(open.ok && idsOf(open.value.entries)).toEqual([late.id]);
		const since = await history.list(sam, { from: '2026-11-09' });
		expect(since.ok && idsOf(since.value.entries)).toEqual([tenth.id, early.id]);
	});

	it('leaves out deleted entries and other households', async () => {
		const { history, logAt, eventAt, sessionLogs, behaviourEvents, ripley } = await setup();
		const kept = await logAt(hours(-1));
		const gone = await logAt(hours(-2));
		const goneEvent = await eventAt(hours(-3));
		await logAt(hours(-4), ripley, 'recall-basics', 'h9');
		await sessionLogs.softDelete('h1' as Id, gone.id, 1, 'sam' as Id);
		await behaviourEvents.softDelete('h1' as Id, goneEvent.id, 1, 'sam' as Id);
		const page = await history.list(sam, {});
		expect(page.ok && idsOf(page.value.entries)).toEqual([kept.id]);
	});

	it('lists completed care tasks at the head of the day they were done (D35)', async () => {
		const { history, logAt, eventAt, careDone } = await setup();
		// 17:00 on the 10th and 09:00 on the 9th in Johannesburg; the care was done on each day.
		const log = await logAt(hours(0));
		const ninth = await eventAt(new Date('2026-11-09T07:00:00Z'));
		const careTenth = await careDone('2026-11-10');
		const careNinth = await careDone('2026-11-09');
		await careDone('2026-11-08', undefined, 'upcoming');
		await careDone('2026-11-08', undefined, 'cancelled');
		await careDone('2026-11-08', undefined, 'completed', 'h9');
		const page = await history.list(sam, {});
		if (!page.ok) throw new Error(JSON.stringify(page.error));
		expect(idsOf(page.value.entries)).toEqual([careTenth.id, log.id, careNinth.id, ninth.id]);
		expect(page.value.entries[0]).toMatchObject({ kind: 'care', view: { names: { sam: 'Sam' } } });
	});

	it('places care on the last millisecond of its day on the household clocks', () => {
		expect(careAt('2026-11-10' as PlainDate, 'Africa/Johannesburg')).toEqual(
			new Date('2026-11-10T21:59:59.999Z')
		);
	});

	it('pages through care tasks done on the same day without skipping or repeating', async () => {
		const { history, logAt, careDone } = await setup();
		const made = [];
		for (let i = 0; i < 4; i++) made.push(await careDone('2026-11-09'));
		// A log at the very millisecond the care entries sort at, tied only by ID.
		made.push(await logAt(careAt('2026-11-09' as PlainDate, sam.timeZone)));
		made.push(await logAt(new Date('2026-11-09T08:00:00Z')));
		made.push(await careDone('2026-11-08'));
		const seen: string[] = [];
		let cursor: string | undefined;
		for (let round = 0; round < 10; round++) {
			const page = await history.list(sam, { cursor }, 2);
			if (!page.ok) throw new Error(JSON.stringify(page.error));
			seen.push(...idsOf(page.value.entries));
			cursor = page.value.next;
			if (!cursor) break;
		}
		expect(seen).toHaveLength(made.length);
		expect(new Set(seen)).toEqual(new Set(made.map((m) => m.id)));
		expect(seen.at(-1)).toBe(made.at(-1)!.id);
	});

	it('filters care by type, dog and dates, and leaves it out for an exercise or events', async () => {
		const { history, logAt, eventAt, careDone, ripley, miso } = await setup();
		await logAt(hours(-1));
		await eventAt(hours(-2));
		const ripleys = await careDone('2026-11-10', ripley);
		const misos = await careDone('2026-11-08', miso);
		const list = async (filter: Parameters<typeof history.list>[1]) => {
			const page = await history.list(sam, filter);
			if (!page.ok) throw new Error(JSON.stringify(page.error));
			return idsOf(page.value.entries);
		};
		expect(await list({ type: 'care' })).toEqual([ripleys.id, misos.id]);
		expect(await list({ type: 'care', dogId: miso })).toEqual([misos.id]);
		expect(await list({ type: 'care-vaccination' })).toEqual([ripleys.id, misos.id]);
		expect(await list({ type: 'care-puppy_school' })).toEqual([]);
		expect(await list({ type: 'other' })).toEqual([]);
		expect(await list({ type: 'care', from: '2026-11-09' })).toEqual([ripleys.id]);
		expect(await list({ type: 'care', to: '2026-11-08' })).toEqual([misos.id]);
		expect(await list({ type: 'events' })).toHaveLength(1);
		expect(await list({ type: 'barking' })).toHaveLength(1);
		expect(await list({ type: 'training' })).toHaveLength(1);
		expect(await list({ exerciseId: 'recall-basics' })).toHaveLength(1);
	});

	it('refuses a bad filter, field by field', async () => {
		const { history } = await setup();
		expect(
			await history.list(sam, {
				dogId: 'nope',
				type: 'walks',
				from: '2026-13-01',
				to: 'soon',
				cursor: 'x'
			})
		).toMatchObject({
			ok: false,
			error: {
				kind: 'validation',
				fields: {
					dog: expect.any(Array),
					type: expect.any(Array),
					from: expect.any(Array),
					to: expect.any(Array),
					cursor: expect.any(Array)
				}
			}
		});
		expect(await history.list(sam, { from: '2026-11-10', to: '2026-11-09' })).toMatchObject({
			ok: false,
			error: { fields: { to: ['Choose an end date on or after the start.'] } }
		});
	});
});

describe('the cursor', () => {
	it('round-trips and rejects anything else', () => {
		const id = createIdGenerator(() => at.getTime()).next();
		expect(decodeCursor(encodeCursor({ at, id }))).toEqual({ at, id });
		expect(decodeCursor('123')).toBeNull();
		expect(decodeCursor(`abc.${id}`)).toBeNull();
		expect(decodeCursor('123.not-an-id')).toBeNull();
	});
});
