import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { manualClock } from '../../testing/clock.js';
import {
	COLLECTIONS_LEFT_OUT,
	EXPORTED_COLLECTIONS,
	mongoHouseholdRecords
} from './household-records.js';
import { migrate, migrations } from './migrations/index.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

describe('mongoHouseholdRecords (D46)', () => {
	it('decides for every collection whether the export reads it', async () => {
		// Migrations create every collection the app writes to, with its indexes.
		const names = (await db.mongo.db.listCollections({}, { nameOnly: true }).toArray())
			.map((c) => c.name)
			.filter((name) => !name.startsWith('system.'));
		const decided = new Set<string>([
			...EXPORTED_COLLECTIONS,
			...Object.keys(COLLECTIONS_LEFT_OUT)
		]);
		expect(names.filter((name) => !decided.has(name))).toEqual([]);
		expect(EXPORTED_COLLECTIONS.filter((name) => name in COLLECTIONS_LEFT_OUT)).toEqual([]);
	});

	it("reads every exported collection's documents for the household, and no other's", async () => {
		const [mine, theirs] = [ids.next(), ids.next()];
		const written = new Map<string, Id[]>();
		for (const name of EXPORTED_COLLECTIONS) {
			for (const householdId of [mine, theirs]) {
				const docs = [ids.next(), ids.next()].map((_id) => ({
					_id,
					householdId,
					schemaVersion: 1
				}));
				await db.mongo.db.collection(name).insertMany(docs as never[]);
				if (householdId === mine)
					written.set(
						name,
						docs.map((d) => d._id)
					);
			}
		}

		const records = await mongoHouseholdRecords(db.mongo.db).read(mine);

		const read = Object.values(records).map((list: { id: Id; householdId: Id }[]) => {
			expect(list.every((r) => r.householdId === mine)).toBe(true);
			return list.map((r) => r.id);
		});
		expect(read).toEqual(EXPORTED_COLLECTIONS.map((name) => written.get(name)));
	});

	it('reads deleted logs with the planned session they completed', async () => {
		const householdId = ids.next();
		const [logId, sessionId] = [ids.next(), ids.next()];
		await db.mongo.db.collection('sessionLogs').insertOne({
			_id: logId,
			householdId,
			deletedAt: new Date(),
			deletedPlannedSessionId: sessionId,
			schemaVersion: 1
		} as never);

		const { sessionLogs } = await mongoHouseholdRecords(db.mongo.db).read(householdId);

		expect(sessionLogs).toMatchObject([{ id: logId, plannedSessionId: sessionId }]);
	});
});
