// Vitest global setup for integration tests: one MongoDB in Docker for the whole run. Each test
// file then works in its own database.
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
	export interface ProvidedContext {
		mongoUri: string;
	}
}

// Atlas Local: the major version Atlas runs (architecture §3.5), already a single-node replica set
// so transactions work. `MONGO_TEST_IMAGE` overrides it.
const IMAGE = process.env.MONGO_TEST_IMAGE ?? 'mongodb/mongodb-atlas-local:8.0';

export default async function setup(project: TestProject) {
	const container = await new GenericContainer(IMAGE)
		.withExposedPorts(27017)
		// The image's own health check polls every 30 s; poll faster so the run starts sooner.
		.withHealthCheck({
			test: ['CMD', '/usr/local/bin/runner', 'healthcheck'],
			interval: 1000,
			timeout: 10_000,
			retries: 60
		})
		.withWaitStrategy(Wait.forHealthCheck())
		.start();
	const host = `${container.getHost()}:${container.getMappedPort(27017)}`;
	project.provide('mongoUri', `mongodb://${host}/?directConnection=true`);
	return () => container.stop();
}
