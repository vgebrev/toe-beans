// Storage for dogs and their photos (architecture §3.6, §4.4). Every dog method takes the household,
// so no call can reach another household's dog by ID.
import type { Dog, DogDetails, PhotoSize, ProfilePhoto } from '../../domain/dog.js';
import type { Id } from '../../domain/id.js';
import type { Result } from '../../domain/result.js';
import type { NotFoundError, StaleVersionError } from '../errors.js';

export type NewDog = Omit<Dog, 'version' | 'createdAt' | 'updatedAt'>;

/** A field set to undefined is removed: `birth: undefined` forgets the birth date. */
export type DogChanges = { [K in keyof DogDetails]?: DogDetails[K] } & {
	photo?: ProfilePhoto;
	archivedAt?: Date | undefined;
};

export interface DogRepository {
	insert(dog: NewDog): Promise<Dog>;
	findById(householdId: Id, id: Id): Promise<Dog | null>;
	/** Archived ones too, oldest first. */
	list(householdId: Id): Promise<Dog[]>;
	/** Applies `changes` if the dog is still at `expectedVersion` (NFR-13). */
	update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: DogChanges
	): Promise<Result<Dog, NotFoundError | StaleVersionError>>;
}

export interface StoredPhoto {
	body: ReadableStream<Uint8Array>;
	/** In bytes. */
	size: number;
}

/**
 * Durable, private object storage (architecture §3.6, NFR-05): R2 or another S3-compatible
 * store, or a directory when self-hosting. Keys come from `photoKey`, never from a request.
 */
export interface PhotoStore {
	put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
	/** Null when there's nothing at `key`. */
	getStream(key: string): Promise<StoredPhoto | null>;
	/** Missing keys are fine. */
	delete(keys: readonly string[]): Promise<void>;
}

/** The re-encoded photo: WebP in each size, with no EXIF or GPS location left (§3.6). */
export type ProcessedPhoto = Record<PhotoSize, Uint8Array>;

export interface PhotoProcessor {
	/** Null when the bytes aren't a JPEG, PNG or WebP image it can read. */
	process(bytes: Uint8Array): Promise<ProcessedPhoto | null>;
}
