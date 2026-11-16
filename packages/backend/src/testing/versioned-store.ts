// What the in-memory repository doubles share: household-scoped records with a version, written
// the way `HouseholdCollection` writes them (a stale version is refused, an undefined change
// removes the field, and each write bumps the version), and handed out as copies.
import { notFound, staleVersion } from '../application/errors.js';
import { err, ok } from '../domain/result.js';

interface Versioned {
	id: string;
	householdId: string;
	version: number;
	updatedAt: Date;
}

export function versionedStore<T extends Versioned>(now: () => Date, resource: string) {
	const items = new Map<string, T>();
	const inHousehold = (householdId: string, id: string) => {
		const item = items.get(id);
		return item?.householdId === householdId ? item : undefined;
	};

	/** Applies `changes` to `item`, found by the caller, if it's at `expectedVersion`. */
	function edit(item: T | undefined, expectedVersion: number, changes: object) {
		if (!item) return err(notFound(resource));
		if (item.version !== expectedVersion) return err(staleVersion);
		for (const [key, value] of Object.entries(changes)) {
			if (value === undefined) delete (item as Record<string, unknown>)[key];
			else (item as Record<string, unknown>)[key] = structuredClone(value);
		}
		Object.assign(item, { version: item.version + 1, updatedAt: now() });
		return ok(structuredClone(item));
	}

	return {
		items,
		inHousehold,
		insert(item: Omit<T, 'version' | 'createdAt' | 'updatedAt'>): T {
			const at = now();
			const stored = { ...item, version: 1, createdAt: at, updatedAt: at } as unknown as T;
			items.set(item.id, structuredClone(stored));
			return structuredClone(stored);
		},
		edit,
		update: (householdId: string, id: string, expectedVersion: number, changes: object) =>
			edit(inHousehold(householdId, id), expectedVersion, changes)
	};
}
