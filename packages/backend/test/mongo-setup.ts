// Vitest global setup for integration tests: one MongoDB replica set in Docker for the whole run
// (transactions need a replica set). Each test file then works in its own database.
import { release } from 'node:os';
import { MongoDBContainer } from '@testcontainers/mongodb';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
	export interface ProvidedContext {
		mongoUri: string;
	}
}

// The major version Atlas runs (architecture §3.5). MongoDB 8.0 refuses to start on Linux 6.19+
// (SERVER-121912, a TCMalloc/rseq crash), so newer kernels get 9.0 instead. `MONGO_TEST_IMAGE`
// overrides both. Tags need all three parts: the container picks mongosh over the legacy shell by
// parsing the tag as semver.
function image(): string {
	if (process.env.MONGO_TEST_IMAGE) return process.env.MONGO_TEST_IMAGE;
	const [major = 0, minor = 0] = release().split('.').map(Number);
	const newKernel = process.platform === 'linux' && (major > 6 || (major === 6 && minor >= 19));
	return newKernel ? 'mongo:9.0.4' : 'mongo:8.0.34';
}

export default async function setup(project: TestProject) {
	const container = await new MongoDBContainer(image()).start();
	project.provide('mongoUri', `${container.getConnectionString()}/?directConnection=true`);
	return () => container.stop();
}
