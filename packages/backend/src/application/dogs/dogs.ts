// A household's dogs and their profile photos (architecture §3.6, §5.2, FR-02). A dog can't exist
// without a photo, so adding one takes both in one call: the photo is stored first and removed
// again if the dog isn't saved, which leaves nothing behind to clean up.
import {
	cleanDogDetails,
	photoKey,
	pickAccent,
	type DatePrecision,
	type Dog,
	type DogDetailsInput,
	type PhotoSize
} from '../../domain/dog.js';
import { validationError } from '../../domain/errors.js';
import { isId, type Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { MemberContext } from '../auth/auth.js';
import type { Planner, PlannerContext } from '../planner/planner.js';
import {
	notFound,
	staleVersion,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import type { DogChanges, Ports, ProcessedPhoto, StoredPhoto } from '../ports/index.js';

/** The most a photo may be before re-encoding. The phone downscales first, so it's rarely near. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

const SIZES: readonly PhotoSize[] = ['large', 'thumb'];

/** What a person sends. In an update, a missing field stays as it was and null clears it. */
export interface DogInput {
	name?: string | undefined;
	birth?: { date: string; precision: DatePrecision } | null | undefined;
	adoptionDate?: string | null | undefined;
	notes?: string | null | undefined;
}

/** A dog's photo, found and checked, but not opened until the caller needs the bytes. */
export interface PhotoHandle {
	/** Changes whenever the photo does, so it makes the ETag. */
	photoId: Id;
	/** Null if the object has gone missing from storage. */
	open(): Promise<StoredPhoto | null>;
}

export type Dogs = ReturnType<typeof createDogs>;

const orUndefined = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

/**
 * `planner` is told when a dog is archived or brought back, in the same transaction, so the
 * dog's plans pause and resume with it (D24).
 */
export function createDogs(
	{
		dogs,
		photos,
		photoProcessor,
		uow,
		clock,
		ids,
		logger
	}: Pick<Ports, 'dogs' | 'photos' | 'photoProcessor' | 'uow' | 'clock' | 'ids' | 'logger'>,
	planner: Pick<Planner, 'dogArchived' | 'dogRestored'>
) {
	const log = logger.child({ component: 'dogs' });
	/** A malformed ID can't be anyone's dog, so it's not found without asking the database. */
	const find = async (ctx: MemberContext, id: string) =>
		isId(id) ? dogs.findById(ctx.householdId, id) : null;

	/** Field errors for the photo, before any decoding: there must be one, and not too large. */
	const photoProblem = (photo: Uint8Array | null): string | null => {
		if (!photo || photo.byteLength === 0) return 'Add a photo of your dog.';
		if (photo.byteLength > PHOTO_MAX_BYTES) return 'Choose a photo under 10 MB.';
		return null;
	};
	const unreadable = validationError('The photo is not valid.', {
		photo: ['Choose a JPEG, PNG or WebP photo.']
	});

	/** Stores every size, or none: a failure part-way removes what was written, then throws. */
	async function store(
		dog: Pick<Dog, 'householdId' | 'id'>,
		photoId: Id,
		processed: ProcessedPhoto
	): Promise<string[]> {
		const keys: string[] = [];
		try {
			for (const size of SIZES) {
				const key = photoKey(dog, photoId, size);
				keys.push(key);
				await photos.put(key, processed[size], 'image/webp');
			}
			return keys;
		} catch (e) {
			await discard(keys);
			throw e;
		}
	}

	/** Best effort: an object left behind is only wasted space, so it's logged, not thrown. */
	async function discard(keys: string[]) {
		try {
			await photos.delete(keys);
		} catch (e) {
			log.warn('could not delete photo objects', { err: e, count: keys.length });
		}
	}

	return {
		/** Every dog in the household, archived ones too, in the order they were added. */
		list: (ctx: MemberContext): Promise<Dog[]> => dogs.list(ctx.householdId),

		async get(ctx: MemberContext, id: string): Promise<Result<Dog, NotFoundError>> {
			const dog = await find(ctx, id);
			return dog ? ok(dog) : err(notFound('dog'));
		},

		async create(
			ctx: MemberContext,
			input: { details: DogInput; photo: Uint8Array | null }
		): Promise<Result<Dog, ValidationError>> {
			const now = clock.now();
			const { name = '', birth, adoptionDate, notes } = input.details;
			const details = cleanDogDetails(
				{
					name,
					birth: orUndefined(birth),
					adoptionDate: orUndefined(adoptionDate),
					notes: orUndefined(notes)
				},
				now
			);
			const problem = photoProblem(input.photo);
			if (!details.ok || problem) {
				return err(
					validationError('The dog is not valid.', {
						...(!details.ok && details.error.fields),
						...(problem && { photo: [problem] })
					})
				);
			}
			const processed = await photoProcessor.process(input.photo!);
			if (!processed) return err(unreadable);

			const { householdId } = ctx;
			const others = await dogs.list(householdId);
			const dog = { id: ids.next(), householdId };
			const photoId = ids.next();
			const keys = await store(dog, photoId, processed);
			try {
				const saved = await dogs.insert({
					...dog,
					...details.value,
					photo: { photoId, updatedAt: now },
					accent: pickAccent(others.filter((d) => !d.archivedAt).map((d) => d.accent))
				});
				log.info('dog added', { householdId, dogId: dog.id });
				return ok(saved);
			} catch (e) {
				await discard(keys);
				throw e;
			}
		},

		/**
		 * Changes the details given, and archives or brings back the dog with `archived`. The
		 * result is checked as a whole, so a new birth date can't land after the adoption date.
		 * Archiving also cancels the dog's planned sessions, and bringing it back plans them again.
		 */
		async update(
			ctx: PlannerContext,
			input: { id: string; expectedVersion: number; details: DogInput; archived?: boolean }
		): Promise<Result<Dog, ValidationError | NotFoundError | StaleVersionError>> {
			const dog = await find(ctx, input.id);
			if (!dog) return err(notFound('dog'));
			const now = clock.now();
			const pick = <K extends keyof DogDetailsInput>(key: K, current: DogDetailsInput[K]) => {
				const given = input.details[key];
				return given === undefined ? current : (given ?? undefined);
			};
			const details = cleanDogDetails(
				{
					name: input.details.name ?? dog.name,
					birth: pick('birth', dog.birth),
					adoptionDate: pick('adoptionDate', dog.adoptionDate),
					notes: pick('notes', dog.notes)
				},
				now
			);
			if (!details.ok) return details;
			const { name, birth, adoptionDate, notes } = details.value;
			// Each key is set even when undefined, which is what removes a cleared field.
			const changes: DogChanges = { name, birth, adoptionDate, notes };
			if (input.archived !== undefined) {
				changes.archivedAt = input.archived ? (dog.archivedAt ?? now) : undefined;
			}
			const archiving = input.archived === true && !dog.archivedAt;
			const restoring = input.archived === false && !!dog.archivedAt;
			const updated = await uow.run<Dog, NotFoundError | StaleVersionError>(async () => {
				const saved = await dogs.update(ctx.householdId, dog.id, input.expectedVersion, changes);
				if (!saved.ok || !(archiving || restoring)) return saved;
				const plans = archiving
					? await planner.dogArchived(ctx, dog.id)
					: await planner.dogRestored(ctx, dog.id);
				return plans.ok ? saved : plans;
			});
			if (updated.ok && input.archived !== undefined && input.archived !== !!dog.archivedAt) {
				const event = input.archived ? 'dog archived' : 'dog unarchived';
				log.info(event, { householdId: ctx.householdId, dogId: dog.id });
			}
			return updated;
		},

		/** Replaces the photo. The old one's objects go once the dog points at the new one. */
		async changePhoto(
			ctx: MemberContext,
			input: { id: string; expectedVersion: number; photo: Uint8Array | null }
		): Promise<Result<Dog, ValidationError | NotFoundError | StaleVersionError>> {
			const problem = photoProblem(input.photo);
			if (problem) return err(validationError('The photo is not valid.', { photo: [problem] }));
			const dog = await find(ctx, input.id);
			if (!dog) return err(notFound('dog'));
			// Checked again by the write; this only saves decoding a photo that can't be saved.
			if (dog.version !== input.expectedVersion) return err(staleVersion);
			const processed = await photoProcessor.process(input.photo!);
			if (!processed) return err(unreadable);

			const photoId = ids.next();
			const keys = await store(dog, photoId, processed);
			let updated;
			try {
				updated = await dogs.update(ctx.householdId, dog.id, input.expectedVersion, {
					photo: { photoId, updatedAt: clock.now() }
				});
			} catch (e) {
				await discard(keys);
				throw e;
			}
			if (!updated.ok) {
				await discard(keys);
				return updated;
			}
			await discard(SIZES.map((size) => photoKey(dog, dog.photo.photoId, size)));
			log.info('dog photo changed', { householdId: ctx.householdId, dogId: dog.id });
			return updated;
		},

		/**
		 * The photo of a dog in the viewer's household (NFR-02, scenario 9). The key comes from the
		 * dog, never from the request, so nobody can name another household's object.
		 */
		async photo(
			ctx: MemberContext,
			input: { id: string; size: PhotoSize }
		): Promise<Result<PhotoHandle, NotFoundError>> {
			const dog = await find(ctx, input.id);
			if (!dog) return err(notFound('dog'));
			const { photoId } = dog.photo;
			return ok({
				photoId,
				async open() {
					const stored = await photos.getStream(photoKey(dog, photoId, input.size));
					if (!stored) {
						log.error('dog photo missing from storage', {
							householdId: ctx.householdId,
							dogId: dog.id,
							size: input.size
						});
					}
					return stored;
				}
			});
		}
	};
}
