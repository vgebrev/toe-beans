// Composition root: wires infrastructure adapters into use cases (architecture §4.1). Later slices
// add repositories, the push sender and the worker to `ports`.
import type { Ports } from './application/ports/index.js';
import type { Config } from './config.js';
import { createIdGenerator } from './domain/id.js';
import { createHttp, type Http } from './http/index.js';
import { migrate, migrations } from './infrastructure/persistence/migrations/index.js';
import { connectMongo } from './infrastructure/persistence/mongo.js';
import { mongoUnitOfWork } from './infrastructure/persistence/unit-of-work.js';
import { systemClock } from './infrastructure/system-clock.js';

export interface Backend {
	config: Config;
	http: Http;
	/** Closes the database connection; call once the server has stopped taking requests. */
	close(): Promise<void>;
}

/**
 * Connects to Mongo and applies pending migrations, so the host should await it before listening
 * (S-1.4). Rejects if either fails. `overrides` replaces adapters in tests, e.g. a manual clock.
 */
export async function createBackend(
	config: Config,
	overrides: Partial<Ports> = {}
): Promise<Backend> {
	const clock = overrides.clock ?? systemClock;
	const mongo = await connectMongo(config.mongodb.uri, config.mongodb.db);
	try {
		await migrate(mongo.db, migrations, { clock });
	} catch (e) {
		await mongo.close();
		throw e;
	}
	const ports: Ports = {
		clock,
		ids: overrides.ids ?? createIdGenerator(() => clock.now().getTime()),
		uow: overrides.uow ?? mongoUnitOfWork(mongo.client)
	};
	return { config, http: createHttp(ports), close: () => mongo.close() };
}
