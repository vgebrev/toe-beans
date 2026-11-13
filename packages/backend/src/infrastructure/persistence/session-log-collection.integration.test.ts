import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import type { NewSessionLog } from '../../application/ports/index.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { err, ok } from '../../domain/result.js';
import { manualClock } from '../../testing/clock.js';
import { householdIsolationSuite } from '../../testing/household-isolation.js';
import { migrate, migrations } from './migrations/index.js';
import { mongoPlannedSessions } from './planner-collections.js';
import { mongoSessionLogs, SESSION_LOGS } from './session-log-collection.js';
import { mongoUnitOfWork } from './unit-of-work.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-10T15:00:00Z');
const clock = manualClock(at);

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const logs = () => mongoSessionLogs(db.mongo.db, clock);

const newLog = (householdId: Id, overrides: Partial<NewSessionLog> = {}): NewSessionLog => ({
	id: ids.next(),
	householdId,
	dogId: ids.next(),
	exerciseId: 'recall-basics',
	exerciseContentVersion: 1,
	caregiverId: ids.next(),
	updatedBy: ids.next(),
	practisedAt: at,
	outcome: 'not_assessed',
	...overrides
});

describe('mongoSessionLogs', () => {
	it('stores a log with the common fields and reads it back', async () => {
		const household = ids.next();
		const log = newLog(household, { outcome: 'partial', environment: 'garden', durationMin: 5 });
		const inserted = await logs().insert(log);
		expect(inserted).toEqual({ ...log, version: 1, createdAt: at, updatedAt: at });
		expect(await logs().findById(household, log.id)).toEqual(inserted);
		expect(await logs().findByIds(household, [log.id, ids.next()])).toEqual([inserted]);
		expect(
			await db.mongo.db.collection(SESSION_LOGS).findOne({ _id: log.id as never })
		).toMatchObject({ householdId: household, schemaVersion: 1 });
	});

	it('updates at the expected version, removing fields set to undefined', async () => {
		const household = ids.next();
		const log = await logs().insert(newLog(household, { notes: 'n' }));
		const editor = ids.next();
		const updated = await logs().update(household, log.id, 1, {
			outcome: 'successful',
			notes: undefined,
			updatedBy: editor
		});
		expect(updated).toMatchObject({
			ok: true,
			value: { outcome: 'successful', updatedBy: editor, version: 2 }
		});
		expect(updated.ok && 'notes' in updated.value).toBe(false);
		expect(await logs().update(household, log.id, 1, { updatedBy: editor })).toEqual(
			err({ kind: 'stale-version' })
		);
	});

	it('lists the logs practised in a range, in time order', async () => {
		const household = ids.next();
		const minute = 60_000;
		const later = await logs().insert(newLog(household, { practisedAt: new Date(+at + minute) }));
		const first = await logs().insert(newLog(household, { practisedAt: at }));
		await logs().insert(newLog(household, { practisedAt: new Date(+at + 2 * minute) }));
		await logs().insert(newLog(household, { practisedAt: new Date(+at - 1) }));
		const listed = await logs().listPractisedBetween(household, at, new Date(+at + 2 * minute));
		expect(listed.map((l) => l.id)).toEqual([first.id, later.id]);
	});

	it('hides soft-deleted logs', async () => {
		const household = ids.next();
		const log = await logs().insert(newLog(household));
		await db.mongo.db
			.collection(SESSION_LOGS)
			.updateOne({ _id: log.id as never }, { $set: { deletedAt: at } });
		expect(await logs().findById(household, log.id)).toBeNull();
		expect(await logs().findByIds(household, [log.id])).toEqual([]);
		expect(await logs().listPractisedBetween(household, at, new Date(+at + 1))).toEqual([]);
	});

	it('allows one log per planned session', async () => {
		const household = ids.next();
		const plannedSessionId = ids.next();
		await logs().insert(newLog(household, { plannedSessionId }));
		await expect(logs().insert(newLog(household, { plannedSessionId }))).rejects.toThrow(
			/duplicate key/
		);
		// Ad-hoc logs have none, and don't collide.
		await logs().insert(newLog(household));
		await logs().insert(newLog(household));
	});

	it('rolls back the log when completing its session fails in the same transaction', async () => {
		const household = ids.next();
		const sessions = mongoPlannedSessions(db.mongo.db, clock);
		const session = await sessions.insert({
			id: ids.next(),
			householdId: household,
			dogId: ids.next(),
			exerciseId: 'recall-basics',
			scheduledAt: at,
			status: 'planned',
			updatedBy: ids.next()
		});
		const log = newLog(household, { plannedSessionId: session.id });
		const result = await mongoUnitOfWork(db.mongo.client).run(async () => {
			await logs().insert(log);
			return sessions.update(household, session.id, 7, {
				status: 'completed',
				sessionLogId: log.id,
				updatedBy: log.caregiverId
			});
		});
		expect(result).toEqual(err({ kind: 'stale-version' }));
		expect(await logs().findById(household, log.id)).toBeNull();

		const committed = await mongoUnitOfWork(db.mongo.client).run(async () => {
			await logs().insert(log);
			const done = await sessions.update(household, session.id, 1, {
				status: 'completed',
				sessionLogId: log.id,
				updatedBy: log.caregiverId
			});
			return done.ok ? ok(undefined) : done;
		});
		expect(committed.ok).toBe(true);
		expect(await sessions.findById(household, session.id)).toMatchObject({
			status: 'completed',
			sessionLogId: log.id
		});
	});
	it('lists a page of the timeline, newest first, after a cursor and by dog and exercise', async () => {
		const household = ids.next();
		const dog = ids.next();
		const minutes = (m: number) => new Date(+at - m * 60_000);
		const a = await logs().insert(newLog(household, { dogId: dog, practisedAt: minutes(1) }));
		const b = await logs().insert(newLog(household, { dogId: dog, practisedAt: minutes(2) }));
		const c = await logs().insert(newLog(household, { dogId: dog, practisedAt: minutes(2) }));
		const d = await logs().insert(
			newLog(household, { practisedAt: minutes(3), exerciseId: 'sit' })
		);
		const ids_ = (list: { id: Id }[]) => list.map((l) => l.id);
		expect(ids_(await logs().listTimeline(household, { limit: 10 }))).toEqual([
			a.id,
			c.id,
			b.id,
			d.id
		]);
		expect(
			ids_(
				await logs().listTimeline(household, { limit: 2, before: { at: c.practisedAt, id: c.id } })
			)
		).toEqual([b.id, d.id]);
		expect(ids_(await logs().listTimeline(household, { dogId: dog, limit: 10 }))).toEqual([
			a.id,
			c.id,
			b.id
		]);
		expect(ids_(await logs().listTimeline(household, { exerciseId: 'sit', limit: 10 }))).toEqual([
			d.id
		]);
		expect(
			ids_(await logs().listTimeline(household, { from: minutes(2), to: minutes(1), limit: 10 }))
		).toEqual([c.id, b.id]);
	});

	it('soft-deletes and restores at the expected version, freeing the planned session meanwhile', async () => {
		const household = ids.next();
		const sessionId = ids.next();
		const deleter = ids.next();
		const log = await logs().insert(newLog(household, { plannedSessionId: sessionId }));

		expect(await logs().softDelete(household, log.id, 2, deleter)).toEqual(
			err({ kind: 'stale-version' })
		);
		const deleted = await logs().softDelete(household, log.id, 1, deleter);
		expect(deleted).toMatchObject({
			ok: true,
			value: { deletedAt: at, plannedSessionId: sessionId, updatedBy: deleter, version: 2 }
		});
		expect(await logs().findById(household, log.id)).toBeNull();
		expect(await logs().listTimeline(household, { limit: 10 })).toEqual([]);
		expect(await logs().findDeleted(household, log.id)).toMatchObject({
			plannedSessionId: sessionId
		});
		expect(await logs().update(household, log.id, 2, { updatedBy: deleter })).toEqual(
			err({ kind: 'stale-version' })
		);

		// The session can be logged again while this one is deleted.
		const again = await logs().insert(newLog(household, { plannedSessionId: sessionId }));
		await logs().softDelete(household, again.id, 1, deleter);

		expect(await logs().restore(household, log.id, 1, deleter)).toEqual(
			err({ kind: 'stale-version' })
		);
		const restored = await logs().restore(household, log.id, 2, deleter);
		expect(restored).toMatchObject({
			ok: true,
			value: { plannedSessionId: sessionId, version: 3 }
		});
		expect(restored.ok && 'deletedAt' in restored.value).toBe(false);
		expect(await logs().findById(household, log.id)).toMatchObject({ plannedSessionId: sessionId });
		expect(await logs().findDeleted(household, log.id)).toBeNull();
		expect(await logs().restore(household, log.id, 3, deleter)).toEqual(
			err({ kind: 'not-found', resource: 'log' })
		);
	});

	it("can't delete or restore another household's log", async () => {
		const household = ids.next();
		const log = await logs().insert(newLog(household));
		expect(await logs().softDelete(ids.next(), log.id, 1, ids.next())).toEqual(
			err({ kind: 'not-found', resource: 'log' })
		);
		await logs().softDelete(household, log.id, 1, ids.next());
		expect(await logs().findDeleted(ids.next(), log.id)).toBeNull();
		expect(await logs().restore(ids.next(), log.id, 2, ids.next())).toEqual(
			err({ kind: 'not-found', resource: 'log' })
		);
	});

	it('purges deleted logs 30 days after deletion', async () => {
		const indexes = await db.mongo.db.collection(SESSION_LOGS).indexes();
		expect(indexes.find((i) => i.key.deletedAt === 1)).toMatchObject({
			expireAfterSeconds: 30 * 24 * 60 * 60
		});
	});
});

householdIsolationSuite('mongoSessionLogs', () => ({
	create: async (householdId) => (await logs().insert(newLog(householdId))).id,
	read: (householdId, id) => logs().findById(householdId, id),
	list: async (householdId) =>
		(await logs().listPractisedBetween(householdId, new Date(0), new Date(+at + 1))).map(
			(l) => l.id
		),
	update: async (householdId, id) => {
		const current = await db.mongo.db.collection(SESSION_LOGS).findOne({ _id: id as never });
		return logs().update(householdId, id, current!.version as number, {
			outcome: 'successful',
			updatedBy: ids.next()
		});
	}
}));

householdIsolationSuite('mongoSessionLogs: timeline and delete', () => ({
	create: async (householdId) => (await logs().insert(newLog(householdId))).id,
	read: (householdId, id) => logs().findById(householdId, id),
	list: async (householdId) =>
		(await logs().listTimeline(householdId, { limit: 10 })).map((l) => l.id),
	remove: async (householdId, id) => {
		const current = await db.mongo.db.collection(SESSION_LOGS).findOne({ _id: id as never });
		return logs().softDelete(householdId, id, current!.version as number, ids.next());
	}
}));
