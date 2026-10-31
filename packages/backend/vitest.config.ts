import { configDefaults, defineProject } from 'vitest/config';

// Unit tests only. Integration tests need Docker and run with `pnpm test:integration`.
export default defineProject({
	test: {
		exclude: [...configDefaults.exclude, '**/*.integration.test.ts']
	}
});
