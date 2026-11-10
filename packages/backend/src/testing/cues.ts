// In-memory double for the cue repository, for unit tests of the use cases. The Mongo adapter has
// its own integration test.
import type { CueRepository } from '../application/ports/index.js';
import { notFound, staleVersion } from '../application/errors.js';
import type { Cue } from '../domain/cue.js';
import { err, ok } from '../domain/result.js';

export function memoryCues(now: () => Date): CueRepository & { all(): Cue[] } {
	const cues = new Map<string, Cue>();
	const inHousehold = (householdId: string, id: string) => {
		const cue = cues.get(id);
		return cue?.householdId === householdId ? cue : undefined;
	};
	return {
		all: () => structuredClone([...cues.values()]),
		async insert(cue) {
			const at = now();
			const stored: Cue = { ...cue, version: 1, createdAt: at, updatedAt: at };
			cues.set(cue.id, structuredClone(stored));
			return structuredClone(stored);
		},
		findById: async (householdId, id) => structuredClone(inHousehold(householdId, id) ?? null),
		list: async (householdId) =>
			structuredClone(
				[...cues.values()]
					.filter((c) => c.householdId === householdId)
					.sort((a, b) => a.id.localeCompare(b.id))
			),
		async update(householdId, id, expectedVersion, changes) {
			const cue = inHousehold(householdId, id);
			if (!cue) return err(notFound('cue'));
			if (cue.version !== expectedVersion) return err(staleVersion);
			for (const [key, value] of Object.entries(changes)) {
				if (value === undefined) delete (cue as unknown as Record<string, unknown>)[key];
				else (cue as unknown as Record<string, unknown>)[key] = value;
			}
			Object.assign(cue, { version: cue.version + 1, updatedAt: now() });
			return ok(structuredClone(cue));
		},
		async delete(householdId, id, expectedVersion) {
			const cue = inHousehold(householdId, id);
			if (!cue) return err(notFound('cue'));
			if (cue.version !== expectedVersion) return err(staleVersion);
			cues.delete(id);
			return ok(undefined);
		}
	};
}
