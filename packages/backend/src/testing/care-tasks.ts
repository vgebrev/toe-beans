// An in-memory double for the care task repository, for unit tests of the use cases and the tick.
// The Mongo adapter has its own integration test.
import type { CareTaskRepository } from '../application/ports/index.js';
import { notFound, staleVersion } from '../application/errors.js';
import type { CareTask } from '../domain/care-task.js';
import { err, ok } from '../domain/result.js';

const due = (t: CareTask) => `${t.dueDate} ${t.dueTime ?? ''}`;
const soonest = (a: CareTask, b: CareTask) =>
	due(a).localeCompare(due(b)) || a.id.localeCompare(b.id);

export function memoryCareTasks(now: () => Date): CareTaskRepository & { all(): CareTask[] } {
	const items = new Map<string, CareTask>();
	const own = (householdId: string, id: string) => {
		const item = items.get(id);
		return item?.householdId === householdId ? item : undefined;
	};
	const inHousehold = (householdId: string) =>
		[...items.values()].filter((t) => t.householdId === householdId);
	return {
		all: () => structuredClone([...items.values()]),
		async insert(task) {
			const at = now();
			const stored: CareTask = { ...task, version: 1, createdAt: at, updatedAt: at };
			items.set(task.id, structuredClone(stored));
			return structuredClone(stored);
		},
		findById: async (householdId, id) => structuredClone(own(householdId, id) ?? null),
		async update(householdId, id, expectedVersion, changes) {
			const item = own(householdId, id);
			if (!item) return err(notFound('care task'));
			if (item.version !== expectedVersion) return err(staleVersion);
			for (const [key, value] of Object.entries(changes)) {
				if (value === undefined) delete (item as unknown as Record<string, unknown>)[key];
				else (item as unknown as Record<string, unknown>)[key] = structuredClone(value);
			}
			Object.assign(item, { version: item.version + 1, updatedAt: now() });
			return ok(structuredClone(item));
		},
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
