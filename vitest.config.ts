import { defineConfig } from 'vitest/config';

// Each package, the web app and each tool is a Vitest project with its own defaults.
export default defineConfig({
	test: {
		projects: ['packages/*', 'apps/web', 'tools/*']
	}
});
