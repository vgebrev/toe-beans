// An in-memory double for the behaviour event repository, for unit tests of the use cases. The
// Mongo adapter has its own integration test.
import type { BehaviourEventRepository } from '../application/ports/index.js';
import { notFound, staleVersion } from '../application/errors.js';
import type { BehaviourEvent } from '../domain/behaviour-event.js';
import { err, ok } from '../domain/result.js';
import { timelinePage } from './timeline.js';

export function memoryBehaviourEvents(
	now: () => Date
): BehaviourEventRepository & { all(): BehaviourEvent[] } {
	const items = new Map<string, BehaviourEvent>();
	const live = (householdId: string, id: string) => {
		const item = items.get(id);
		return item?.householdId === householdId && !item.deletedAt ? item : undefined;
	};
	const deleted = (householdId: string, id: string) => {
		const item = items.get(id);
		return item?.householdId === householdId && item.deletedAt ? item : undefined;
	};
	return {
		all: () => structuredClone([...items.values()]),
		async insert(event) {
			const at = now();
			const stored: BehaviourEvent = { ...event, version: 1, createdAt: at, updatedAt: at };
			items.set(event.id, structuredClone(stored));
			return structuredClone(stored);
		},
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
		async softDelete(householdId, id, expectedVersion, deletedBy) {
			const item = live(householdId, id);
			if (!item) return err(notFound('event'));
			if (item.version !== expectedVersion) return err(staleVersion);
			Object.assign(item, {
				deletedAt: now(),
				updatedBy: deletedBy,
				version: item.version + 1,
				updatedAt: now()
			});
			return ok(structuredClone(item));
		},
		findDeleted: async (householdId, id) => structuredClone(deleted(householdId, id) ?? null),
		async restore(householdId, id, expectedVersion, restoredBy) {
			const item = deleted(householdId, id);
			if (!item) return err(notFound('event'));
			if (item.version !== expectedVersion) return err(staleVersion);
			delete item.deletedAt;
			Object.assign(item, { updatedBy: restoredBy, version: item.version + 1, updatedAt: now() });
			return ok(structuredClone(item));
		},
		async update(householdId, id, expectedVersion, changes) {
			const item = live(householdId, id);
			if (!item) return err(notFound('event'));
			if (item.version !== expectedVersion) return err(staleVersion);
			for (const [key, value] of Object.entries(changes)) {
				if (value === undefined) delete (item as unknown as Record<string, unknown>)[key];
				else (item as unknown as Record<string, unknown>)[key] = structuredClone(value);
			}
			Object.assign(item, { version: item.version + 1, updatedAt: now() });
			return ok(structuredClone(item));
		}
	};
}
