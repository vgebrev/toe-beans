// Env vars SvelteKit exposes to the app (Kit 3). The backend validates its own variables
// (`loadConfig`), so only what the browser needs is declared here.
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	SENTRY_DSN: {
		public: true,
		description:
			'Sentry DSN for error reports from the browser and the server. Unset turns reporting off.',
		schema: (value) => {
			if (!value) return undefined;
			if (!/^https:\/\/[^\s]+$/.test(value)) throw new Error('must be an https URL');
			return value;
		}
	}
});
