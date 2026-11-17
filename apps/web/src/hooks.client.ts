import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { dev, version } from '$app/env';
import { SENTRY_DSN } from '$app/env/public';
import { z } from 'zod';
import { connection } from '#lib/client/connection.svelte.js';
import { reportError, startErrorReporting } from '#lib/client/error-reporting.js';
import { install } from '#lib/client/install.svelte.js';

export const init: ClientInit = () => {
	// Zod's fast path compiles parsers with `new Function`, and probing for it trips the CSP
	// (no 'unsafe-eval', architecture §7), which Chrome lists as an issue on every page.
	z.config({ jitless: true });
	connection.start();
	install.start();
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
	// A navigation whose page data couldn't be fetched: the connection, not a bug (ui.md §6.1).
	if (!navigator.onLine || isFailedFetch(error)) return { message: 'Offline', offline: true };
	reportError(error, { route: event.route.id ?? '(unmatched)' });
};

/** What fetch throws with no response: "Failed to fetch" in Chrome, other words elsewhere. */
const isFailedFetch = (error: unknown) =>
	error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
