// Sentry for unexpected server errors (architecture §9). Errors only: no tracing, no breadcrumbs,
// and nothing about the request beyond the tags the caller passes, since URLs can carry invite
// tokens and headers carry the session cookie (NFR-12).
import * as Sentry from '@sentry/node';
import type { ErrorReporter } from '../../application/ports/index.js';
import { scrubText } from '../logging/scrub.js';
import { currentRequestContext } from '../request-context.js';

export interface SentryOptions {
	dsn: string;
	environment: string;
	release?: string;
}

/** Initialises the Sentry SDK for the process. Call once, from the composition root. */
export function createSentryReporter({ dsn, environment, release }: SentryOptions): ErrorReporter {
	Sentry.init({
		dsn,
		environment,
		release,
		// SDK 11 collects all of these by default.
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false
		},
		maxBreadcrumbs: 0,
		integrations: Sentry.getDefaultIntegrationsWithoutPerformance(),
		beforeSend: scrubEvent
	});
	return {
		capture(error, tags = {}) {
			try {
				Sentry.withScope((scope) => {
					scope.setTags({ ...currentRequestContext(), ...tags });
					Sentry.captureException(error);
				});
			} catch {
				// Reporting must never turn one failure into two.
			}
		},
		async flush() {
			await Sentry.close(2000);
		}
	};
}

/** Drops request, user and breadcrumb data, and masks sensitive text in exception messages. */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
	delete event.request;
	delete event.user;
	delete event.breadcrumbs;
	if (event.message) event.message = scrubText(event.message);
	for (const exception of event.exception?.values ?? []) {
		if (exception.value) exception.value = scrubText(exception.value);
	}
	return event;
}

/** Used when no DSN is configured, e.g. locally: errors are still logged by the caller. */
export const noopErrorReporter: ErrorReporter = {
	capture() {},
	async flush() {}
};
