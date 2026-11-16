// An in-memory double for the care task repository, for unit tests of the use cases and the tick.
// The Mongo adapter has its own integration test.
import type { CareTaskRepository } from '../application/ports/index.js';
import type { CareTask } from '../domain/care-task.js';
import { versionedStore } from './versioned-store.js';

const due = (t: CareTask) => `${t.dueDate} ${t.dueTime ?? ''}`;
const soonest = (a: CareTask, b: CareTask) =>
	due(a).localeCompare(due(b)) || a.id.localeCompare(b.id);

export function memoryCareTasks(now: () => Date): CareTaskRepository & { all(): CareTask[] } {
	const store = versionedStore<CareTask>(now, 'care task');
	const { items, inHousehold: own } = store;
	const inHousehold = (householdId: string) =>
		[...items.values()].filter((t) => t.householdId === householdId);
	return {
		all: () => structuredClone([...items.values()]),
		insert: async (task) => store.insert(task),
		findById: async (householdId, id) => structuredClone(own(householdId, id) ?? null),
		update: async (householdId, id, expectedVersion, changes) =>
			store.update(householdId, id, expectedVersion, changes),
		listUpcoming: async (householdId, { until } = {}) =>
			structuredClone(
				inHousehold(householdId)
					.filter((t) => t.status === 'upcoming' && (!until || t.dueDate <= until))
					.sort(soonest)
			),
		listClosed: async (householdId, limit) =>
			structuredClone(
				inHousehold(householdId)
					.filter((t) => t.status !== 'upcoming')
					.sort((a, b) => soonest(b, a))
					.slice(0, limit)
			),
		listCompletedTimeline: async (householdId, { dogId, categories, from, to, before, limit }) =>
			structuredClone(
				inHousehold(householdId)
					.filter(
						(t) =>
							t.status === 'completed' &&
							t.completedOn !== undefined &&
							(!dogId || t.dogId === dogId) &&
							(!categories || categories.includes(t.category)) &&
							(!from || t.completedOn >= from) &&
							(!to || t.completedOn <= to) &&
							(!before ||
								t.completedOn < before.date ||
								(before.id !== undefined && t.completedOn === before.date && t.id < before.id))
					)
					.sort((a, b) => b.completedOn!.localeCompare(a.completedOn!) || (a.id < b.id ? 1 : -1))
					.slice(0, limit)
			),
		listUpcomingAcrossHouseholds: async (from, to) =>
			structuredClone(
				[...items.values()]
					.filter((t) => t.status === 'upcoming' && t.dueDate >= from && t.dueDate <= to)
					.sort(soonest)
			)
	};
}
