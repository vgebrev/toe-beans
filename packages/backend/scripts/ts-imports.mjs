// Lets Node run the repo's TypeScript directly (`node --import ./packages/backend/scripts/ts-imports.mjs file.ts`):
// Node strips the types itself, and this maps the `.js` in relative imports (NodeNext style) to
// the `.ts` file beside it when there's no `.js`. For dev scripts, never the app.
import { registerHooks } from 'node:module';

registerHooks({
	resolve(specifier, context, nextResolve) {
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if (!/^\.{1,2}\//.test(specifier) || !specifier.endsWith('.js')) throw error;
			return nextResolve(specifier.slice(0, -3) + '.ts', context);
		}
	}
});
