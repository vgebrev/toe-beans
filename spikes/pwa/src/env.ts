import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	VAPID_PUBLIC_KEY: { public: true, description: 'VAPID public key (applicationServerKey)' },
	VAPID_PRIVATE_KEY: { description: 'VAPID private key; never sent to the browser' },
	VAPID_SUBJECT: { description: 'VAPID contact: an https: or mailto: URL' },
	TICK_AUDIENCE: {
		schema: (v) => v || undefined,
		description: 'Audience of the Cloud Scheduler OIDC token; unset disables /internal/tick'
	},
	TICK_INVOKER: {
		schema: (v) => v || undefined,
		description: 'Email of the service account Cloud Scheduler signs tick tokens as'
	}
});
