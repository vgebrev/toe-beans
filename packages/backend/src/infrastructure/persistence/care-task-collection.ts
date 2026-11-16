// Mongo adapter for care tasks (architecture §3.5, §4.4, §5.2, D30), on HouseholdCollection so
// every call is scoped to the household, but for the reminder tick's read across households.
// Indexes come from migration 0011.
import type { Db } from 'mongodb';
import type { CareTaskRepository, Clock } from '../../application/ports/index.js';
import type { CareTask } from '../../domain/care-task.js';
import { ok } from '../../domain/result.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';

export const CARE_TASKS = 'careTasks';

const CARE_SCHEMA = 1;

type CareDoc = HouseholdDocument &
	Omit<CareTask, 'id' | 'householdId' | 'version' | 'createdAt' | 'updatedAt'>;

function toTask({ _id, schemaVersion: _, ...rest }: CareDoc): CareTask {
	return { id: _id, ...rest };
}

// A task with no time sorts before timed ones on its day: Mongo puts a missing field first.
const soonest = { dueDate: 1, dueTime: 1, _id: 1 } as const;
const latest = { dueDate: -1, dueTime: -1, _id: -1 } as const;

export function mongoCareTasks(db: Db, clock: Clock): CareTaskRepository {
	const raw = db.collection<CareDoc>(CARE_TASKS);
	const tasks = new HouseholdCollection<CareDoc>(raw, {
		resource: 'care task',
		schemaVersion: CARE_SCHEMA,
		clock
	});
	return {
		async insert({ id, householdId, ...fields }) {
			return toTask(await tasks.insert(householdId, id, fields));
		},
		async findById(householdId, id) {
			const doc = await tasks.findById(householdId, id);
			return doc ? toTask(doc) : null;
		},
		async update(householdId, id, expectedVersion, changes) {
			const updated = await tasks.update(householdId, id, expectedVersion, changes);
			return updated.ok ? ok(toTask(updated.value)) : updated;
		},
		async listUpcoming(householdId, { until } = {}) {
			const docs = await tasks.find(
				householdId,
				{ status: 'upcoming', ...(until && { dueDate: { $lte: until } }) } as never,
				{ sort: soonest, limit: 500 }
			);
			return docs.map(toTask);
		},
		async listClosed(householdId, limit) {
			const docs = await tasks.find(
				householdId,
				{ status: { $in: ['completed', 'cancelled'] } } as never,
				{ sort: latest, limit }
			);
			return docs.map(toTask);
		},
		// History's care source (D35), on the (householdId, status, completedOn, _id) index from
		// migration 0014.
		async listCompletedTimeline(householdId, { dogId, categories, from, to, before, limit }) {
			const range: Record<string, string> = {};
			if (from) range.$gte = from;
			if (to) range.$lte = to;
			const docs = await tasks.find(
				householdId,
				{
					status: 'completed',
					...(dogId && { dogId }),
					...(categories && { category: { $in: [...categories] } }),
					...(Object.keys(range).length > 0 && { completedOn: range }),
					...(before && {
						$or: [
							{ completedOn: { $lt: before.date } },
							...(before.id ? [{ completedOn: before.date, _id: { $lt: before.id } }] : [])
						]
					})
				} as never,
				{ sort: { completedOn: -1, _id: -1 }, limit }
			);
			return docs.map(toTask);
		},
		// Across households, for the reminder tick (D27): the raw collection, read only. Uses the
		// (status, dueDate) index.
		async listUpcomingAcrossHouseholds(from, to) {
			const docs = await raw
				.find({ status: 'upcoming', dueDate: { $gte: from, $lte: to } })
				.sort({ dueDate: 1, _id: 1 })
				.limit(5000)
				.toArray();
			return docs.map(toTask);
		}
	};
}
