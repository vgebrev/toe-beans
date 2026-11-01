import { defineConfig } from 'vitest/config';

// Each package, and the web app, is a Vitest project with its own defaults.
export default defineConfig({
	test: {
		projects: ['packages/*', 'apps/web']
	}
});
