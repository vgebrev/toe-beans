// An in-memory double for the session log repository, for unit tests of the use cases. The Mongo
// adapter has its own integration test.
import type { SessionLogRepository } from '../application/ports/index.js';
import { notFound, staleVersion } from '../application/errors.js';
import { err, ok } from '../domain/result.js';
import type { SessionLog } from '../domain/session-log.js';

export function memorySessionLogs(now: () => Date): SessionLogRepository & { all(): SessionLog[] } {
	const items = new Map<string, SessionLog>();
	const live = (householdId: string, id: string) => {
		const item = items.get(id);
		return item?.householdId === householdId && !item.deletedAt ? item : undefined;
	};
	return {
		all: () => structuredClone([...items.values()]),
		async insert(log) {
			if (
				log.plannedSessionId &&
				[...items.values()].some((l) => l.plannedSessionId === log.plannedSessionId)
			) {
				throw new Error('duplicate plannedSessionId');
			}
			const at = now();
			const stored: SessionLog = { ...log, version: 1, createdAt: at, updatedAt: at };
			items.set(log.id, structuredClone(stored));
			return structuredClone(stored);
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
		async update(householdId, id, expectedVersion, changes) {
			const item = live(householdId, id);
			if (!item) return err(notFound('log'));
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
