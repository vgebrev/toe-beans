import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

// Layer rules (architecture §4.2, NFR-15). Each entry says which imports a layer may NOT make.
// Regexes match the import string, so they catch relative paths (`../infrastructure/x.js`)
// as well as package names.
const sibling = (...layers) => `(^|/)(${layers.join('|')})(/|\\.js$)`;
// Any library: not a relative or #subpath import, and not vitest (tests sit next to the code).
const anyPackage = '^(?![./]|#|vitest$)';
const drivers = '^(mongodb|web-push|openid-client|@aws-sdk/|aws4fetch|sharp|pino|@sentry/)';
const framework = {
	regex: '^(@sveltejs/|\\$app/|svelte($|/))',
	message: 'backend and contracts are framework-independent (NFR-15): no SvelteKit or Svelte.'
};

const layer = (files, ...patterns) => ({
	files,
	rules: { 'no-restricted-imports': ['error', { patterns: [framework, ...patterns] }] }
});
const forbid = (regex, message) => ({ regex, message });

export default defineConfig(
	{
		ignores: [
			'spikes/',
			'workspace/',
			'**/node_modules/',
			'**/.svelte-kit/',
			'**/build/',
			'coverage/',
			'**/test-results/',
			'**/playwright-report/'
		]
	},
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		rules: {
			// TypeScript checks undefined names better than ESLint can.
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
		}
	},

	// packages/backend
	layer(
		['packages/backend/src/domain/**'],
		forbid(
			sibling('application', 'infrastructure', 'http', 'worker', 'composition'),
			'domain depends on nothing.'
		),
		forbid(`${anyPackage}(?!node:crypto$)`, 'domain uses no libraries (only node:crypto for IDs).')
	),
	layer(
		['packages/backend/src/application/**'],
		forbid(
			sibling('infrastructure', 'http', 'worker', 'composition'),
			'application depends on domain only; declare a port instead.'
		),
		forbid(
			anyPackage,
			'application uses no libraries; infrastructure adapters implement its ports.'
		)
	),
	layer(
		['packages/backend/src/infrastructure/**'],
		forbid(
			sibling('http', 'worker', 'composition'),
			'infrastructure implements application ports; it never calls http or worker.'
		)
	),
	layer(
		['packages/backend/src/http/**'],
		forbid(
			sibling('infrastructure', 'worker', 'composition'),
			'http handlers reach infrastructure only through use cases.'
		),
		forbid(drivers, 'Only infrastructure imports drivers and SDKs.')
	),
	layer(
		['packages/backend/src/worker/**'],
		forbid(
			sibling('infrastructure', 'http', 'composition'),
			'the worker runs use cases; composition wires its adapters.'
		),
		forbid(drivers, 'Only infrastructure imports drivers and SDKs.')
	),
	layer(['packages/backend/src/*.ts', 'packages/backend/src/testing/**']),

	// packages/contracts: plain Zod schemas, safe to ship to the browser.
	layer(
		['packages/contracts/src/**'],
		forbid('^@toe-beans/', 'contracts depend on nothing else in the workspace.'),
		forbid(`${anyPackage}(?!zod($|/))`, 'contracts use Zod only.')
	),

	// apps/web: route handlers are thin adapters over the backend, so no drivers anywhere in the
	// app, and client-side code may import contracts but never the backend.
	{
		files: ['apps/web/src/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						forbid(drivers, 'Drivers and SDKs belong in packages/backend/src/infrastructure.')
					]
				}
			]
		}
	},
	{
		files: ['apps/web/src/**'],
		ignores: [
			'apps/web/src/**/*.server.ts',
			'apps/web/src/routes/**/+server.ts',
			'apps/web/src/lib/server/**'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						forbid('^@toe-beans/backend', 'Client-side code may import @toe-beans/contracts only.'),
						forbid(drivers, 'Drivers and SDKs belong in packages/backend/src/infrastructure.')
					]
				}
			]
		}
	},
	// The one SDK the browser needs: error reporting has to run where the errors happen
	// (architecture §9). Only this file loads it.
	{
		files: [
			'apps/web/src/lib/client/error-reporting.ts',
			'apps/web/src/lib/client/sentry-scrub*.ts'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						forbid('^@toe-beans/backend', 'Client-side code may import @toe-beans/contracts only.'),
						forbid('^@sentry/(?!browser$)', 'The browser uses @sentry/browser only.'),
						forbid(
							'^(mongodb|web-push|openid-client|@aws-sdk/|aws4fetch|sharp|pino)',
							'Drivers and SDKs belong in packages/backend/src/infrastructure.'
						)
					]
				}
			]
		}
	}
);
