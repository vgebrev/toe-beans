// What leaves the browser in an error report (NFR-12). Kept free of SDK and `$app` imports so it
// can be unit-tested on its own.
import type { ErrorEvent } from '@sentry/browser';

/**
 * Keeps the user agent (which phone and Chrome version, the main thing worth knowing) and drops
 * the URL, which can carry an invite token, along with user data and breadcrumbs.
 */
export function scrubBrowserEvent(event: ErrorEvent): ErrorEvent {
	const userAgent = event.request?.headers?.['User-Agent'];
	delete event.request;
	if (userAgent) event.request = { headers: { 'User-Agent': userAgent } };
	delete event.user;
	delete event.breadcrumbs;
	return event;
}
