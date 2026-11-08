// In-memory doubles for the dog and photo ports, for unit tests of the use cases. The Mongo and
// storage adapters have their own integration tests.
import type {
	DogRepository,
	PhotoProcessor,
	PhotoStore,
	ProcessedPhoto
} from '../application/ports/index.js';
import { notFound, staleVersion } from '../application/errors.js';
import type { Dog } from '../domain/dog.js';
import { err, ok } from '../domain/result.js';

export function memoryDogs(now: () => Date): DogRepository & { all(): Dog[] } {
	const dogs = new Map<string, Dog>();
	const inHousehold = (householdId: string, id: string) => {
		const dog = dogs.get(id);
		return dog?.householdId === householdId ? dog : undefined;
	};
	return {
		all: () => structuredClone([...dogs.values()]),
		async insert(dog) {
			const at = now();
			const stored: Dog = { ...dog, version: 1, createdAt: at, updatedAt: at };
			dogs.set(dog.id, structuredClone(stored));
			return structuredClone(stored);
		},
		findById: async (householdId, id) => structuredClone(inHousehold(householdId, id) ?? null),
		list: async (householdId) =>
			structuredClone(
				[...dogs.values()]
					.filter((d) => d.householdId === householdId)
					.sort((a, b) => a.id.localeCompare(b.id))
			),
		async update(householdId, id, expectedVersion, changes) {
			const dog = inHousehold(householdId, id);
			if (!dog) return err(notFound('dog'));
			if (dog.version !== expectedVersion) return err(staleVersion);
			for (const [key, value] of Object.entries(changes)) {
				if (value === undefined) delete (dog as unknown as Record<string, unknown>)[key];
				else (dog as unknown as Record<string, unknown>)[key] = structuredClone(value);
			}
			Object.assign(dog, { version: dog.version + 1, updatedAt: now() });
			return ok(structuredClone(dog));
		}
	};
}

/** Keeps objects in a map. */
export function memoryPhotoStore(): PhotoStore & {
	keys(): string[];
	bytes(key: string): Uint8Array | undefined;
} {
	const objects = new Map<string, Uint8Array>();
	return {
		keys: () => [...objects.keys()].sort(),
		bytes: (key: string) => objects.get(key),
		async put(key: string, bytes: Uint8Array) {
			objects.set(key, bytes);
		},
		async getStream(key: string) {
			const bytes = objects.get(key);
			if (!bytes) return null;
			return { body: new Response(bytes.slice()).body!, size: bytes.byteLength };
		},
		async delete(keys: readonly string[]) {
			for (const key of keys) objects.delete(key);
		}
	};
}

/** Takes any bytes starting `IMG`, and tags each size so tests can tell them apart. */
export const fakePhotoProcessor: PhotoProcessor = {
	async process(bytes) {
		if (new TextDecoder().decode(bytes.slice(0, 3)) !== 'IMG') return null;
		const tag = (size: string) => new TextEncoder().encode(`${size}:${bytes.byteLength}`);
		return { large: tag('large'), thumb: tag('thumb') } satisfies ProcessedPhoto;
	}
};

export const fakePhoto = (extra = '') => new TextEncoder().encode(`IMG${extra}`);
