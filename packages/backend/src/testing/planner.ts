// In-memory doubles for the planner repositories, for unit tests of the use cases. The Mongo
// adapters have their own integration test.
import type {
	PlannedSessionRepository,
	TrainingPlanRepository
} from '../application/ports/index.js';
import { notFound, staleVersion } from '../application/errors.js';
import type { PlannedSession, TrainingPlan } from '../domain/planner.js';
import { err, ok } from '../domain/result.js';

interface Versioned {
	id: string;
	householdId: string;
	version: number;
	updatedAt: Date;
}

function versionedStore<T extends Versioned>(now: () => Date, resource: string) {
	const items = new Map<string, T>();
	const inHousehold = (householdId: string, id: string) => {
		const item = items.get(id);
		return item?.householdId === householdId ? item : undefined;
	};
	return {
		items,
		inHousehold,
		insert(item: Omit<T, 'version' | 'createdAt' | 'updatedAt'>): T {
			const at = now();
			const stored = { ...item, version: 1, createdAt: at, updatedAt: at } as unknown as T;
			items.set(item.id, structuredClone(stored));
			return structuredClone(stored);
		},
		update(householdId: string, id: string, expectedVersion: number, changes: object) {
			const item = inHousehold(householdId, id);
			if (!item) return err(notFound(resource));
			if (item.version !== expectedVersion) return err(staleVersion);
			for (const [key, value] of Object.entries(changes)) {
				if (value === undefined) delete (item as Record<string, unknown>)[key];
				else (item as Record<string, unknown>)[key] = structuredClone(value);
			}
			Object.assign(item, { version: item.version + 1, updatedAt: now() });
			return ok(structuredClone(item));
		}
	};
}

export function memoryTrainingPlans(
	now: () => Date
): TrainingPlanRepository & { all(): TrainingPlan[] } {
	const store = versionedStore<TrainingPlan>(now, 'plan');
	const own = (householdId: string) =>
		[...store.items.values()]
			.filter((p) => p.householdId === householdId)
			.sort((a, b) => a.id.localeCompare(b.id));
	return {
		all: () => structuredClone([...store.items.values()]),
		insert: async (plan) => store.insert(plan),
		findById: async (householdId, id) =>
			structuredClone(store.inHousehold(householdId, id) ?? null),
		findByIds: async (householdId, ids) =>
			structuredClone(own(householdId).filter((p) => ids.includes(p.id))),
		listRunning: async (householdId, date) =>
			structuredClone(own(householdId).filter((p) => p.until === undefined || p.until >= date)),
		update: async (householdId, id, expectedVersion, changes) =>
			store.update(householdId, id, expectedVersion, changes),
		async advanceHorizon(householdId, id, from, to) {
			const plan = store.inHousehold(householdId, id);
			if (!plan || plan.horizon !== from) return false;
			plan.horizon = to;
			return true;
		}
	};
}

export function memoryPlannedSessions(
	now: () => Date
): PlannedSessionRepository & { all(): PlannedSession[] } {
	const store = versionedStore<PlannedSession>(now, 'session');
	const own = (householdId: string) =>
		[...store.items.values()].filter((s) => s.householdId === householdId);
	return {
		all: () =>
			structuredClone(
				[...store.items.values()].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
			),
		insert: async (session) => store.insert(session),
		async insertOccurrences(householdId, list) {
			for (const s of list) {
				const exists = own(householdId).some(
					(o) => o.planId === s.planId && o.occurrenceKey === s.occurrenceKey
				);
				if (!exists) store.insert({ ...s, householdId: s.householdId });
			}
		},
		findById: async (householdId, id) =>
			structuredClone(store.inHousehold(householdId, id) ?? null),
		listBetween: async (householdId, from, to) =>
			structuredClone(
				own(householdId)
					.filter((s) => s.scheduledAt >= from && s.scheduledAt < to)
					.sort(
						(a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.id.localeCompare(b.id)
					)
			),
		listFrom: async (householdId, planId, from) =>
			structuredClone(
				own(householdId)
					.filter((s) => s.planId === planId && s.occurrenceKey! >= from)
					.sort((a, b) => a.occurrenceKey!.localeCompare(b.occurrenceKey!))
			),
		update: async (householdId, id, expectedVersion, changes) =>
			store.update(householdId, id, expectedVersion, changes),
		async deleteUnloggedFrom(householdId, planId, from) {
			const doomed = own(householdId).filter(
				(s) => s.planId === planId && s.occurrenceKey! >= from && s.status !== 'completed'
			);
			for (const s of doomed) store.items.delete(s.id);
			return doomed.length;
		}
	};
}
