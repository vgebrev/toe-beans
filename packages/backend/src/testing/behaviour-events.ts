// An in-memory double for the behaviour event repository, for unit tests of the use cases. The
// Mongo adapter has its own integration test.
import type { BehaviourEventRepository } from '../application/ports/index.js';
import type { BehaviourEvent } from '../domain/behaviour-event.js';
import { timelinePage } from './timeline.js';
import { versionedStore } from './versioned-store.js';

export function memoryBehaviourEvents(
	now: () => Date
): BehaviourEventRepository & { all(): BehaviourEvent[] } {
	const store = versionedStore<BehaviourEvent>(now, 'event');
	const { items } = store;
	const live = (householdId: string, id: string) => {
		const item = store.inHousehold(householdId, id);
		return item && !item.deletedAt ? item : undefined;
	};
	const deleted = (householdId: string, id: string) => {
		const item = store.inHousehold(householdId, id);
		return item?.deletedAt ? item : undefined;
	};
	return {
		all: () => structuredClone([...items.values()]),
		insert: async (event) => store.insert(event),
		findById: async (householdId, id) => structuredClone(live(householdId, id) ?? null),
		listTimeline: async (householdId, { categories, ...query }) =>
			structuredClone(
				timelinePage(
					[...items.values()].filter(
						(l) =>
							l.householdId === householdId &&
							!l.deletedAt &&
							(!categories || categories.includes(l.category))
					),
					(l) => l.occurredAt,
					query
				)
			),
		softDelete: async (householdId, id, expectedVersion, deletedBy) =>
			store.edit(live(householdId, id), expectedVersion, {
				deletedAt: now(),
				updatedBy: deletedBy
			}),
		findDeleted: async (householdId, id) => structuredClone(deleted(householdId, id) ?? null),
		restore: async (householdId, id, expectedVersion, restoredBy) =>
			store.edit(deleted(householdId, id), expectedVersion, {
				deletedAt: undefined,
				updatedBy: restoredBy
			}),
		update: async (householdId, id, expectedVersion, changes) =>
			store.edit(live(householdId, id), expectedVersion, changes)
	};
}
