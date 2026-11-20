// Sentry in the browser (architecture §9): unexpected errors only, no tracing or replay. The SDK
// is loaded only when a DSN is configured, so it costs nothing otherwise. Reports go to the app's
// own origin, which sends them on, since ad blockers block Sentry's hosts (D41).
import { ERROR_RELAY_PATH } from '@toe-beans/contracts';
import { scrubBrowserEvent } from './sentry-scrub.js';

type Sentry = typeof import('@sentry/browser');

let sentry: Sentry | undefined;

export interface ErrorReportingOptions {
	dsn: string | undefined;
	environment: string;
	release: string;
}

export async function startErrorReporting({ dsn, environment, release }: ErrorReportingOptions) {
	if (!dsn) return;
	const sdk = await import('@sentry/browser');
	sdk.init({
		dsn,
		environment,
		release,
		tunnel: ERROR_RELAY_PATH,
		// Not text/plain, which Kit's CSRF check treats as a form post.
		transportOptions: { headers: { 'content-type': 'application/x-sentry-envelope' } },
		// Errors only: no session per page load, and no reports of what the SDK dropped, each of
		// which would be another request to the app.
		integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
		sendClientReports: false,
		maxBreadcrumbs: 0,
		// SDK 11 collects all of these by default.
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false
		},
		beforeSend: scrubBrowserEvent
	});
	sentry = sdk;
}

/** Reports an error caught by SvelteKit. Before the SDK has loaded, or without a DSN, it's dropped. */
export function reportError(error: unknown, tags: Record<string, string>) {
	sentry?.withScope((scope) => {
		scope.setTags(tags);
		sentry?.captureException(error);
	});
}
