import { describe, expect, it } from 'vitest';
import { createHistory } from '../application/history/history.js';
import { createCareTasks } from '../application/care/care-tasks.js';
import { createBehaviourEvents } from '../application/journal/behaviour-events.js';
import { createSessionLogs } from '../application/training-log/session-logs.js';
import type { PlainDate } from '../domain/calendar.js';
import { createIdGenerator, type Id } from '../domain/id.js';
import { memoryUsers } from '../testing/auth.js';
import { memoryBehaviourEvents } from '../testing/behaviour-events.js';
import { memoryCareTasks } from '../testing/care-tasks.js';
import { manualClock } from '../testing/clock.js';
import { memorySessionLogs } from '../testing/session-logs.js';
import { createHistoryHttp } from './history.js';
import { silentLogger } from '../testing/logger.js';
import { memberViewer, noHousehold } from '../testing/viewers.js';

// Tuesday 10 November 2026, 17:00 in Johannesburg.
const at = new Date('2026-11-10T15:00:00Z');

const viewer = memberViewer('h1', 'Africa/Johannesburg');

async function setup() {
	const clock = manualClock(at);
	const now = () => clock.now();
	const ids = createIdGenerator(() => now().getTime());
	const sessionLogs = memorySessionLogs(now);
	const behaviourEvents = memoryBehaviourEvents(now);
	const careTasks = memoryCareTasks(now);
	const ports = {
		sessionLogs,
		behaviourEvents,
		careTasks,
		users: memoryUsers(),
		exercises: { all: () => [], get: () => undefined },
		clock,
		ids,
		logger: silentLogger
	} as never;
	const http = createHistoryHttp(
		createHistory(
			{ sessionLogs, behaviourEvents, careTasks },
			{
				sessionLogs: createSessionLogs(ports),
				behaviourEvents: createBehaviourEvents(ports),
				careTasks: createCareTasks(ports)
			}
		),
		clock
	);
	const dogId = ids.next();
	for (let i = 0; i < 31; i++) {
		await sessionLogs.insert({
			id: ids.next(),
			householdId: 'h1' as Id,
			dogId,
			exerciseId: 'sit',
			exerciseContentVersion: 1,
			caregiverId: 'u' as Id,
			updatedBy: 'u' as Id,
			practisedAt: new Date(at.getTime() - (i + 2) * 60_000),
			outcome: 'not_assessed'
		});
	}
	const event = await behaviourEvents.insert({
		id: ids.next(),
		householdId: 'h1' as Id,
		dogId,
		category: 'visitor',
		occurredAt: new Date(at.getTime() - 60_000),
		recordedBy: 'u' as Id,
		updatedBy: 'u' as Id
	});
	return { http, event, careTasks, ids };
}

describe('history http', () => {
	it('answers a page of entries newest first, with the next cursor', async () => {
		const { http, event } = await setup();
		const first = await http.list(viewer, { query: {} });
		expect(first.status).toBe(200);
		const body = first.body as { entries: { kind: string }[]; next?: string };
		expect(body.entries).toHaveLength(30);
		expect(body.entries[0]).toMatchObject({
			kind: 'event',
			event: { id: event.id, date: '2026-11-10', time: '16:59', recordedBy: 'A former member' }
		});
		expect(body.entries[1]).toMatchObject({
			kind: 'training',
			log: { exercise: { id: 'sit', title: 'sit' }, outcome: 'not_assessed' }
		});
		const second = await http.list(viewer, { query: { cursor: body.next! } });
		const rest = second.body as { entries: unknown[]; next?: string };
		expect(rest.entries).toHaveLength(2);
		expect(rest.next).toBeUndefined();
	});

	it('filters from the query and says which parameter is wrong', async () => {
		const { http } = await setup();
		const events = await http.list(viewer, { query: { type: 'visitor', unknown: 'x' } });
		expect((events.body as { entries: unknown[] }).entries).toHaveLength(1);
		expect(await http.list(viewer, { query: { type: 'walks' } })).toMatchObject({
			status: 400,
			body: { errors: { type: expect.any(Array) } }
		});
	});

	it('answers a completed care task with who marked it done', async () => {
		const { http, careTasks, ids } = await setup();
		const on = '2026-11-09' as PlainDate;
		const task = await careTasks.insert({
			id: ids.next(),
			householdId: 'h1' as Id,
			dogId: ids.next(),
			category: 'parasite_prevention',
			title: 'Deworming',
			dueDate: on,
			status: 'completed',
			completedOn: on,
			history: [
				{ kind: 'created', due: { date: on }, at, by: 'u' as Id },
				{ kind: 'completed', on, at, by: 'u' as Id }
			],
			createdBy: 'u' as Id,
			updatedBy: 'u' as Id
		});
		const res = await http.list(viewer, { query: { type: 'care-parasite_prevention' } });
		expect(res.body).toEqual({
			entries: [
				{
					kind: 'care',
					task: expect.objectContaining({
						id: task.id,
						title: 'Deworming',
						status: 'completed',
						overdue: false,
						completedOn: on,
						completedBy: 'A former member'
					})
				}
			]
		});
		expect((res.body as { entries: [{ task: object }] }).entries[0].task).not.toHaveProperty(
			'history'
		);
	});

	it('answers 404 to someone with no household', async () => {
		const { http } = await setup();
		expect(await http.list(noHousehold, { query: {} })).toMatchObject({ status: 404 });
	});
});
