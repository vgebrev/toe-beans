// The base every household-owned repository builds on (architecture §4.4): each method takes the
// household as a required argument and always filters on it, so no call can reach another
// household's document by ID. It also keeps the common fields (§3.5): version, timestamps and
// schemaVersion. Repositories add the mapping to and from domain entities on top.
import type { Collection, Filter, FindOptions, OptionalUnlessRequiredId } from 'mongodb';
import type { Clock } from '../../application/ports/index.js';
import {
	notFound,
	staleVersion,
	type NotFoundError,
	type StaleVersionError
} from '../../application/errors.js';
import type { Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import { currentSession } from './unit-of-work.js';

/** Fields every household-owned document carries. */
export interface HouseholdDocument {
	_id: Id;
	householdId: Id;
	/** Starts at 1 and goes up by one on every write; the ETag (architecture §3.3). */
	version: number;
	createdAt: Date;
	updatedAt: Date;
	/** The shape this document was written in, so mappers can read older shapes (§3.5). */
	schemaVersion: number;
}

/** What a repository supplies; the base fills in the rest. */
export type Fields<T extends HouseholdDocument> = Omit<T, keyof HouseholdDocument>;

/** A field set to undefined is removed from the document. */
export type Changes<T extends HouseholdDocument> = { [K in keyof Fields<T>]?: Fields<T>[K] };

export type WriteError = NotFoundError | StaleVersionError;

export interface HouseholdCollectionOptions {
	/** For the not-found error's problem title, e.g. `dog`. */
	resource: string;
	/** The shape new documents are written in. */
	schemaVersion: number;
	clock: Clock;
}

export class HouseholdCollection<T extends HouseholdDocument> {
	readonly #collection: Collection<T>;
	readonly #options: HouseholdCollectionOptions;

	constructor(collection: Collection<T>, options: HouseholdCollectionOptions) {
		this.#collection = collection;
		this.#options = options;
	}

	async findById(householdId: Id, id: Id): Promise<T | null> {
		const doc = await this.#collection.findOne(this.#scope(householdId, { _id: id }), {
			session: currentSession()
		});
		return doc as T | null;
	}

	/** `filter` can't widen the household: its own `householdId`, if any, is overridden. */
	async find(
		householdId: Id,
		filter: Filter<Fields<T>> = {},
		options: Pick<FindOptions, 'sort' | 'limit' | 'skip'> = {}
	): Promise<T[]> {
		const docs = await this.#collection
			.find(this.#scope(householdId, filter), { ...options, session: currentSession() })
			.toArray();
		return docs as T[];
	}

	async insert(householdId: Id, id: Id, fields: Fields<T>): Promise<T> {
		const now = this.#options.clock.now();
		const doc = {
			...fields,
			_id: id,
			householdId,
			version: 1,
			createdAt: now,
			updatedAt: now,
			schemaVersion: this.#options.schemaVersion
		} as T;
		await this.#collection.insertOne(doc as OptionalUnlessRequiredId<T>, {
			session: currentSession()
		});
		return doc;
	}

	/**
	 * Applies `changes` only if the document is still at `expectedVersion` (optimistic concurrency,
	 * NFR-13), and returns the updated document. `schemaVersion` stays as it was: a partial update
	 * doesn't bring the rest of an older document up to the current shape.
	 */
	async update(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		changes: Changes<T>
	): Promise<Result<T, WriteError>> {
		const $set: Record<string, unknown> = { updatedAt: this.#options.clock.now() };
		const $unset: Record<string, ''> = {};
		for (const [key, value] of Object.entries(changes)) {
			if (value === undefined) $unset[key] = '';
			else $set[key] = value;
		}
		const updated = await this.#collection.findOneAndUpdate(
			this.#scope(householdId, { _id: id, version: expectedVersion }),
			{ $set, $unset, $inc: { version: 1 } } as never,
			{ returnDocument: 'after', session: currentSession() }
		);
		return updated ? ok(updated as T) : err(await this.#missOn(householdId, id));
	}

	/** Deletes the document only if it's still at `expectedVersion`. */
	async delete(
		householdId: Id,
		id: Id,
		expectedVersion: number
	): Promise<Result<void, WriteError>> {
		const { deletedCount } = await this.#collection.deleteOne(
			this.#scope(householdId, { _id: id, version: expectedVersion }),
			{ session: currentSession() }
		);
		return deletedCount === 1 ? ok(undefined) : err(await this.#missOn(householdId, id));
	}

	/**
	 * Inserts each document unless one matching its `match` exists in the household, in one round
	 * trip. `match` should name a unique index's fields, so a race inserts nothing twice.
	 */
	async insertMissing(
		householdId: Id,
		items: readonly { match: Filter<Fields<T>>; id: Id; fields: Fields<T> }[]
	): Promise<void> {
		if (items.length === 0) return;
		const now = this.#options.clock.now();
		await this.#collection.bulkWrite(
			items.map(({ match, id, fields }) => ({
				updateOne: {
					filter: this.#scope(householdId, match),
					update: {
						$setOnInsert: {
							...fields,
							_id: id,
							householdId,
							version: 1,
							createdAt: now,
							updatedAt: now,
							schemaVersion: this.#options.schemaVersion
						}
					} as never,
					upsert: true
				}
			})),
			{ ordered: false, session: currentSession() }
		);
	}

	/**
	 * Sets fields on the document if it matches `filter`, without counting as an edit: the version
	 * and `updatedAt` stay. For bookkeeping that no one else's ETag should depend on.
	 */
	async setQuietly(
		householdId: Id,
		id: Id,
		filter: Filter<Fields<T>>,
		$set: Partial<Fields<T>>
	): Promise<boolean> {
		const { modifiedCount } = await this.#collection.updateOne(
			this.#scope(householdId, { ...filter, _id: id }),
			{ $set } as never,
			{ session: currentSession() }
		);
		return modifiedCount === 1;
	}

	/** Deletes every document in the household that matches `filter`, whatever its version. */
	async deleteWhere(householdId: Id, filter: Filter<Fields<T>>): Promise<number> {
		const { deletedCount } = await this.#collection.deleteMany(this.#scope(householdId, filter), {
			session: currentSession()
		});
		return deletedCount;
	}

	/** Why a versioned write matched nothing: gone (or another household's), or changed since. */
	async #missOn(householdId: Id, id: Id): Promise<WriteError> {
		const exists = await this.#collection.countDocuments(this.#scope(householdId, { _id: id }), {
			limit: 1,
			session: currentSession()
		});
		return exists ? staleVersion : notFound(this.#options.resource);
	}

	// The household goes last so a caller's filter can't replace it.
	#scope(householdId: Id, filter: object): Filter<T> {
		return { ...filter, householdId } as Filter<T>;
	}
}
