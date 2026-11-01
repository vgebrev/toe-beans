import { defineProject } from 'vitest/config';

// Unit tests for framework-free modules in the app. SvelteKit's Vite plugin isn't loaded, so
// tested files must not import `$app/*`.
export default defineProject({
	test: { name: 'web', include: ['src/**/*.test.ts'] }
});
