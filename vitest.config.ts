import { defineConfig } from 'vitest/config';

// Each package, the web app, each tool and the infra code with tests is a Vitest project with its own defaults.
export default defineConfig({
	test: {
		projects: ['packages/*', 'apps/web', 'tools/*', 'infra/edge', 'infra/spending-cap']
	}
});
