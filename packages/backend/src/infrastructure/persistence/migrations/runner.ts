// Forward-only migrations, run at startup before the server listens (architecture §3.5). Applied
// IDs are recorded in `_migrations`; a lease in `_locks` stops two starting instances running the
// same migration at once.
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { MongoServerError, type Collection, type Db } from 'mongodb';
import type { Clock } from '../../../application/ports/index.js';

export interface Migration {
	/** Sorts in run order, e.g. `0001-sessions-ttl`. Never rename or reorder one once deployed. */
	id: string;
	/**
	 * Recorded only after it resolves, so a crash part-way runs it again on the next start: write
	 * it to be safe to repeat (createIndex already is). It doesn't run in a transaction.
	 */
	up(db: Db): Promise<void>;
}

export interface MigrateOptions {
	clock: Clock;
	/** How long a lease lasts before another instance may take over from a crashed one. */
	leaseMs?: number;
	/** How long to wait for another instance's lease before giving up. */
	waitMs?: number;
	pollMs?: number;
}

interface MigrationRecord {
	_id: string;
	appliedAt: Date;
}

interface Lock {
	_id: string;
	owner: string;
	expiresAt: Date;
}

const LOCK_ID = 'migrations';
const DUPLICATE_KEY = 11000;

/** Applies the migrations not yet recorded, in order, and returns their IDs. */
export async function migrate(
	db: Db,
	migrations: readonly Migration[],
	{ clock, leaseMs = 5 * 60_000, waitMs = 2 * 60_000, pollMs = 500 }: MigrateOptions
): Promise<string[]> {
	checkOrder(migrations);
	const records = db.collection<MigrationRecord>('_migrations');
	const pending = async () => {
		const applied = new Set(await records.distinct('_id'));
		return migrations.filter((m) => !applied.has(m.id));
	};

	// Most starts have nothing to do, so check before taking the lock.
	if ((await pending()).length === 0) return [];

	const locks = db.collection<Lock>('_locks');
	const owner = randomUUID();
	const giveUpAt = clock.now().getTime() + waitMs;
	while (!(await acquire(locks, owner, clock, leaseMs))) {
		if (clock.now().getTime() >= giveUpAt) {
			throw new Error(`Timed out after ${waitMs} ms waiting for another instance's migrations`);
		}
		await sleep(pollMs);
	}

	try {
		// Re-read: the instance that held the lock may have applied them all.
		const ran: string[] = [];
		for (const migration of await pending()) {
			await migration.up(db);
			await records.insertOne({ _id: migration.id, appliedAt: clock.now() });
			ran.push(migration.id);
		}
		return ran;
	} finally {
		await locks.deleteOne({ _id: LOCK_ID, owner });
	}
}

/** Takes the lease if nobody holds it or it expired. */
async function acquire(
	locks: Collection<Lock>,
	owner: string,
	clock: Clock,
	leaseMs: number
): Promise<boolean> {
	const now = clock.now();
	try {
		// A live lease doesn't match, so the upsert tries to insert a second `migrations` lock and
		// hits the unique _id.
		await locks.updateOne(
			{ _id: LOCK_ID, expiresAt: { $lte: now } },
			{ $set: { owner, expiresAt: new Date(now.getTime() + leaseMs) } },
			{ upsert: true }
		);
		return true;
	} catch (e) {
		if (e instanceof MongoServerError && e.code === DUPLICATE_KEY) return false;
		throw e;
	}
}

function checkOrder(migrations: readonly Migration[]): void {
	for (let i = 1; i < migrations.length; i++) {
		if (migrations[i - 1]!.id >= migrations[i]!.id) {
			throw new Error(`Migrations out of order or duplicated at ${migrations[i]!.id}`);
		}
	}
}
