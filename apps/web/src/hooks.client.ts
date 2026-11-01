import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { dev, version } from '$app/env';
import { SENTRY_DSN } from '$app/env/public';
import { reportError, startErrorReporting } from '#lib/client/error-reporting.js';

export const init: ClientInit = () => {
	// Not awaited: reporting must not hold up the first render.
	void startErrorReporting({
		dsn: SENTRY_DSN,
		environment: dev ? 'local' : 'prod',
		release: version
	});
};

export const handleError: HandleClientError = ({ kind, error, event }) => {
	// 404s and errors thrown with `error()` are expected outcomes, not bugs.
	if (kind !== 'unknown') return;
	reportError(error, { route: event.route.id ?? '(unmatched)' });
};
