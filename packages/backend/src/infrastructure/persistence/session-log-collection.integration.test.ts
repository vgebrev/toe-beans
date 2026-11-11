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

	it('hides soft-deleted logs', async () => {
		const household = ids.next();
		const log = await logs().insert(newLog(household));
		await db.mongo.db
			.collection(SESSION_LOGS)
			.updateOne({ _id: log.id as never }, { $set: { deletedAt: at } });
		expect(await logs().findById(household, log.id)).toBeNull();
		expect(await logs().findByIds(household, [log.id])).toEqual([]);
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
});

householdIsolationSuite('mongoSessionLogs', () => ({
	create: async (householdId) => (await logs().insert(newLog(householdId))).id,
	read: (householdId, id) => logs().findById(householdId, id),
	update: async (householdId, id) => {
		const current = await db.mongo.db.collection(SESSION_LOGS).findOne({ _id: id as never });
		return logs().update(householdId, id, current!.version as number, {
			outcome: 'successful',
			updatedBy: ids.next()
		});
	}
}));
