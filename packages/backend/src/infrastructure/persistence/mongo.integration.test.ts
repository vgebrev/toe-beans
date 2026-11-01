import { describe, expect, inject, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import { connectMongo, mongoReadiness } from './mongo.js';

const t = useTestDatabase();

describe('mongoReadiness', () => {
	it('resolves while the database answers', async () => {
		await expect(mongoReadiness(t.mongo.db).check()).resolves.toBeUndefined();
	});

	it('rejects once the client is closed', async () => {
		const closed = await connectMongo(inject('mongoUri'), 'readiness');
		await closed.close();
		await expect(mongoReadiness(closed.db).check()).rejects.toThrow();
	});
});
