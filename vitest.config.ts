import { defineConfig } from 'vitest/config';

// Each package is a Vitest project with its own defaults; apps/web joins once it has unit tests.
export default defineConfig({
	test: {
		projects: ['packages/*']
	}
});
