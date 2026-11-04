import type { RequestEvent } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { errorResponse, REQUEST_ID_HEADER, requestIdFrom } from '@toe-beans/backend';
import { backend, startBackend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export const init: ServerInit = async () => {
	await startBackend();
};

/**
 * Headers the API client reads in universal loads (architecture §3.3). Kit serialises a server
 * render's fetch responses for hydration and makes every header it should keep explicit.
 */
const serializedHeaders = new Set(['etag', REQUEST_ID_HEADER]);
const resolveOptions = {
	filterSerializedResponseHeaders: (name: string) => serializedHeaders.has(name)
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
		const response = await authenticated(event, resolve);
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

/**
 * Refuses cross-origin writes, then resolves the session cookie to `locals.viewer` (architecture
 * §3.4). Signed-out API calls get a 401 here; signed-out pages are sent to sign-in by the
 * `(app)` layout, so client-side navigation gets a proper redirect too.
 */
async function authenticated(
	event: RequestEvent,
	resolve: Parameters<Handle>[0]['resolve']
): Promise<Response> {
	const { auth } = backend().http;
	const headers = event.request.headers;
	const refused = auth.checkOrigin({
		method: event.request.method,
		origin: headers.get('origin'),
		fetchSite: headers.get('sec-fetch-site')
	});
	if (refused) return toResponse(refused);

	event.locals.viewer = null;
	// Probes don't need a viewer, so they never touch the sessions.
	if (quietRoutes.has(event.route.id ?? '')) return resolve(event, resolveOptions);

	const { viewer, cookies } = await auth.authenticate((name) => event.cookies.get(name));
	event.locals.viewer = viewer;
	for (const { name, value, maxAge, secure, sameSite } of cookies) {
		event.cookies.set(name, value, { path: '/', maxAge, httpOnly: true, secure, sameSite });
	}
	if (!viewer && event.url.pathname.startsWith('/api/')) {
		return toResponse(errorResponse({ kind: 'unauthenticated' }));
	}
	return resolve(event, resolveOptions);
}

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
