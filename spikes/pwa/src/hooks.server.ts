import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { instance, ageSeconds, logJson } from '#lib/server/instance.js';

let first = true;

export const init: ServerInit = () => {
	// process.uptime() covers Node start-up and module loading before the server listens.
	logJson('instance started', { revision: instance.revision, uptimeS: process.uptime() });
};

export const handle: Handle = async ({ event, resolve }) => {
	const start = performance.now();
	const response = await resolve(event);
	response.headers.set('x-instance', `${instance.id}; age=${ageSeconds().toFixed(1)}`);
	if (first) {
		first = false;
		logJson('first request', {
			path: event.url.pathname,
			durationMs: Math.round(performance.now() - start),
			uptimeS: process.uptime()
		});
	}
	return response;
};
