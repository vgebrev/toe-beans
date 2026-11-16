// In-memory double for the cue repository, for unit tests of the use cases. The Mongo adapter has
// its own integration test.
import type { CueRepository } from '../application/ports/index.js';
import { notFound, staleVersion } from '../application/errors.js';
import type { Cue } from '../domain/cue.js';
import { err, ok } from '../domain/result.js';
import { versionedStore } from './versioned-store.js';

export function memoryCues(now: () => Date): CueRepository & { all(): Cue[] } {
	const store = versionedStore<Cue>(now, 'cue');
	const { items: cues, inHousehold } = store;
	return {
		all: () => structuredClone([...cues.values()]),
		insert: async (cue) => store.insert(cue),
		findById: async (householdId, id) => structuredClone(inHousehold(householdId, id) ?? null),
		list: async (householdId) =>
			structuredClone(
				[...cues.values()]
					.filter((c) => c.householdId === householdId)
					.sort((a, b) => a.id.localeCompare(b.id))
			),
		update: async (householdId, id, expectedVersion, changes) =>
			store.update(householdId, id, expectedVersion, changes),
		async delete(householdId, id, expectedVersion) {
			const cue = inHousehold(householdId, id);
			if (!cue) return err(notFound('cue'));
			if (cue.version !== expectedVersion) return err(staleVersion);
			cues.delete(id);
			return ok(undefined);
		}
	};
}
