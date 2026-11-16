// An in-memory double for the session log repository, for unit tests of the use cases. The Mongo
// adapter has its own integration test.
import type { SessionLogRepository } from '../application/ports/index.js';
import { timelinePage } from './timeline.js';
import { versionedStore } from './versioned-store.js';
import type { SessionLog } from '../domain/session-log.js';

export function memorySessionLogs(now: () => Date): SessionLogRepository & { all(): SessionLog[] } {
	const store = versionedStore<SessionLog>(now, 'log');
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
		async insert(log) {
			if (
				log.plannedSessionId &&
				[...items.values()].some((l) => !l.deletedAt && l.plannedSessionId === log.plannedSessionId)
			) {
				throw new Error('duplicate plannedSessionId');
			}
			return store.insert(log);
		},
		findById: async (householdId, id) => structuredClone(live(householdId, id) ?? null),
		findByIds: async (householdId, ids) =>
			structuredClone(ids.flatMap((id) => live(householdId, id) ?? [])),
		listPractisedBetween: async (householdId, from, to) =>
			structuredClone(
				[...items.values()]
					.filter(
						(l) =>
							l.householdId === householdId &&
							!l.deletedAt &&
							l.practisedAt >= from &&
							l.practisedAt < to
					)
					.sort(
						(a, b) => a.practisedAt.getTime() - b.practisedAt.getTime() || a.id.localeCompare(b.id)
					)
			),
		listTimeline: async (householdId, { exerciseId, ...query }) =>
			structuredClone(
				timelinePage(
					[...items.values()].filter(
						(l) =>
							l.householdId === householdId &&
							!l.deletedAt &&
							(!exerciseId || l.exerciseId === exerciseId)
					),
					(l) => l.practisedAt,
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
