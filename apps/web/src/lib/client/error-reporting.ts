// Sentry in the browser (architecture §9): unexpected errors only, no tracing or replay. The SDK
// is loaded only when a DSN is configured, so it costs nothing otherwise.
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
