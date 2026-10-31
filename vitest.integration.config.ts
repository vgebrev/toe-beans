import { defineConfig } from 'vitest/config';

// Integration tests against real MongoDB in Docker (Testcontainers), run by `pnpm test:integration`.
export default defineConfig({
	test: {
		include: ['packages/*/src/**/*.integration.test.ts'],
		globalSetup: ['packages/backend/test/mongo-setup.ts'],
		// Pulling the image on a cold machine can take a while.
		hookTimeout: 120_000
	}
});
