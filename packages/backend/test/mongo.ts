// A fresh database per test file on the shared container (see mongo-setup.ts), dropped afterwards.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, inject } from 'vitest';
import { connectMongo, type MongoConnection } from '../src/infrastructure/persistence/mongo.js';

/** Call at the top of a test file; the connection is ready inside tests and hooks. */
export function useTestDatabase(): { readonly mongo: MongoConnection } {
	const ref = {} as { mongo: MongoConnection };
	beforeAll(async () => {
		ref.mongo = await connectMongo(inject('mongoUri'), `test-${randomUUID()}`);
	});
	afterAll(async () => {
		await ref.mongo.db.dropDatabase();
		await ref.mongo.close();
	});
	return ref;
}
