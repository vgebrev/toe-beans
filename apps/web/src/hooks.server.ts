import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { REQUEST_ID_HEADER, requestIdFrom } from '@toe-beans/backend';
import { backend, startBackend } from '#lib/server/backend.js';

export const init: ServerInit = async () => {
	await startBackend();
};

// Probes and the uptime monitor hit these every few minutes; their lines would drown the rest.
const quietRoutes = new Set(['/healthz', '/readyz']);

/**
 * Gives each request an ID, puts it on every log line and error report the request causes and
 * on the response, then logs the request. The route ID is logged, never the path or query,
 * which can carry invite tokens (NFR-12).
 */
export const handle: Handle = ({ event, resolve }) => {
	const requestId = requestIdFrom(event.request.headers.get(REQUEST_ID_HEADER));
	event.locals.requestId = requestId;
	const { logger, withRequestContext } = backend();

	return withRequestContext({ requestId }, async () => {
		const started = performance.now();
		const response = await resolve(event);
		try {
			response.headers.set(REQUEST_ID_HEADER, requestId);
		} catch {
			// Some responses (e.g. from fetch) have immutable headers; the logs still have the ID.
		}
		const route = event.route.id ?? '(unmatched)';
		const log = quietRoutes.has(route) ? logger.debug : logger.info;
		log('request', {
			method: event.request.method,
			route,
			status: response.status,
			durationMs: Math.round(performance.now() - started)
		});
		return response;
	});
};

/** Unexpected errors: logged, reported, and answered with the request ID only. */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	// 404s and errors thrown with `error()` are expected outcomes, not bugs.
	if (kind !== 'unknown') return;
	try {
		const route = event.route.id ?? '(unmatched)';
		backend().logger.error('unhandled error', { err: error, route });
		backend().errors.capture(error, { route });
	} catch {
		// handleError must never throw. If the backend isn't up, init already failed loudly.
	}
	return { requestId: event.locals.requestId };
};
