import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { dev, version } from '$app/env';
import { SENTRY_DSN } from '$app/env/public';
import { connection } from '#lib/client/connection.svelte.js';
import { reportError, startErrorReporting } from '#lib/client/error-reporting.js';
import { install } from '#lib/client/install.svelte.js';
import { sendStuckLoad } from '#lib/client/stuck-load.js';

export const init: ClientInit = () => {
	connection.start();
	install.start();
	// Not awaited: reporting must not hold up the first render. A load left stuck before this
	// start is reported once it's running (S17.11).
	void startErrorReporting({
		dsn: SENTRY_DSN,
		environment: dev ? 'local' : 'prod',
		release: version
	}).then(sendStuckLoad);
};

export const handleError: HandleClientError = ({ kind, error, event }) => {
	// 404s and errors thrown with `error()` are expected outcomes, not bugs.
	if (kind !== 'unknown') return;
	// A navigation whose page data or code couldn't be fetched: the phone offline or the app
	// down, not a bug (ui.md §6.1).
	if (!navigator.onLine || isFailedFetch(error))
		return { message: 'Unreachable', unreachable: true };
	reportError(error, { route: event.route.id ?? '(unmatched)' });
};

/** What fetch throws with no response: "Failed to fetch" in Chrome, other words elsewhere. */
const isFailedFetch = (error: unknown) =>
	error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
