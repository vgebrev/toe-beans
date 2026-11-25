import type { RequestEvent } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { PROXY_SECRET_HEADER, REQUEST_ID_HEADER, requestIdFrom } from '@toe-beans/backend';
import { ERROR_RELAY_PATH } from '@toe-beans/contracts';
import { backend, startBackend } from '#lib/server/backend.js';
import { terms } from '#lib/server/legal.js';
import { SIGN_IN_FONT_PATH } from '#lib/server/sign-in-font.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export const init: ServerInit = async () => {
	await startBackend();
};

/**
 * The Latin fonts start loading with the CSS instead of after it, so they're usually in before
 * first paint and the text doesn't visibly swap (ui.md §6.4). Only Latin: the other subsets have
 * a unicode-range that keeps phones from downloading them, and preloading would defeat that.
 */
const latinFont = /-latin-wght-normal\.[\w-]+\.woff2$/;
/**
 * Headers the API client reads in universal loads (architecture §3.3). Kit serialises a server
 * render's fetch responses for hydration and makes every header it should keep explicit; reading
 * any other throws. `content-type` tells a problem from a gateway error, so without it every API
 * error in a server render would become a 500.
 */
const serializedHeaders = new Set(['content-type', 'etag', REQUEST_ID_HEADER]);
const resolveOptions = {
	filterSerializedResponseHeaders: (name: string) => serializedHeaders.has(name),
	preload: ({ type, path }: { type: 'js' | 'css' | 'font' | 'asset'; path: string }) =>
		type === 'font' ? latinFont.test(path) : type === 'js' || type === 'css'
};

/**
 * For every response that doesn't set its own: pages, redirects and error pages. Cloudflare
 * caches the Worker's fetches by file extension when the origin sends no Cache-Control, so a page
 * that rendered at a path ending `.png` or `.css` would be served from the edge to the next person,
 * one viewer's data and CSP nonce included (security audit R8, web cache deception). `private`
 * keeps shared caches out; `no-cache` has the browser check back, and unlike `no-store` keeps the
 * back/forward cache. Build files never get here: adapter-node serves them. The service worker's
 * precache of the fallback pages ignores it (the Cache API stores what it's given).
 */
const DEFAULT_CACHE_CONTROL = 'private, no-cache';

// The uptime monitor and the deploy hit this every few minutes, and the app's own connection
// checks while it's waking; their lines would drown the rest.
const quietRoutes = new Set(['/readyz']);

// Called by a scheduler, not a browser (architecture §6.3): no Origin header and no session. The
// route checks its own bearer token, so the origin check and session lookup don't apply.
const machineRoutes = new Set(['/internal/tick']);

// The join page says what an invitation is for before asking anyone to sign in (ui.md J2). The
// token is what allows it; accepting is a separate route and needs a session.
const publicApiRoutes = new Set(['/api/v1/invitations/[token]']);

/**
 * API writes that work before the current terms are accepted (backlog S19.1): accepting them, and
 * deleting the account, for someone who would rather leave than agree.
 */
const termsFreeWrites = new Set(['POST /api/v1/me/terms', 'DELETE /api/v1/me']);

// The browser's error reports (architecture D41), security.txt and the login page's font (S19.2):
// no session lookup.
const noViewerRoutes = new Set([
	...quietRoutes,
	ERROR_RELAY_PATH,
	'/.well-known/security.txt',
	SIGN_IN_FONT_PATH
]);

/**
 * Scanners' probes (`/.env`, `/wp-login.php`…) match no route (backlog S17.3). Rendering the app
 * shell's "We couldn't find that" for each costs a render and a session lookup, so a request that
 * isn't a browser's page load gets a short plain 404 instead. A person who opens a mistyped
 * address still sees the app's own page, and unknown API paths stay behind sign-in. (A missing
 * `/_app/` file never gets here: adapter-node answers it.)
 */
const isProbe = (event: RequestEvent) =>
	event.route.id === null &&
	!event.url.pathname.startsWith('/api/') &&
	event.request.headers.get('sec-fetch-dest') !== 'document';

const notFound = () =>
	new Response('Not found\n', {
		status: 404,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});

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
			// HSTS, Referrer-Policy and the like (architecture §7); Kit sets the CSP itself.
			for (const [name, value] of Object.entries(backend().http.edge.securityHeaders())) {
				response.headers.set(name, value);
			}
			if (!response.headers.has('cache-control')) {
				response.headers.set('cache-control', DEFAULT_CACHE_CONTROL);
			}
		} catch {
			// Some responses (e.g. from fetch) have immutable headers; the logs still have the ID.
		}
		const route = event.route.id ?? '(unmatched)';
		// Probes come by the hundred; their lines would drown the rest too.
		const quiet = quietRoutes.has(route) || (response.status === 404 && isProbe(event));
		const log = quiet ? logger.debug : logger.info;
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
 * Refuses requests that bypassed the proxy and cross-origin writes, then resolves the session
 * cookie to `locals.viewer` (architecture §3.4). Signed-out API calls get a 401 here; signed-out
 * pages are sent to sign-in by the `(app)` layout, so client-side navigation gets a proper
 * redirect too. A signed-in person's API writes count against their budget (D32), and wait for
 * them to accept the current terms (S19.1); pages send them to accept from their loads.
 */
async function authenticated(
	event: RequestEvent,
	resolve: Parameters<Handle>[0]['resolve']
): Promise<Response> {
	const { auth, edge } = backend().http;
	const headers = event.request.headers;
	event.locals.viewer = null;
	const route = event.route.id ?? '';
	// The scheduler calls the service directly, not through the proxy.
	if (machineRoutes.has(route)) return resolve(event, resolveOptions);
	// A server render's own API calls (SvelteKit's in-process fetch) never left the container and
	// don't carry the proxy's header; only requests that arrived over the network are checked.
	// /readyz is left out for local checks (Playwright's, compose's). In prod only Cloud Run's
	// invokers reach it directly, and it pings the database at most every 5 s (security audit R4).
	if (!quietRoutes.has(route) && !event.isSubRequest) {
		const bypassed = edge.checkProxy(headers.get(PROXY_SECRET_HEADER));
		if (bypassed) return toResponse(bypassed);
	}
	if (isProbe(event)) return notFound();

	const refused = auth.checkOrigin({
		method: event.request.method,
		origin: headers.get('origin'),
		fetchSite: headers.get('sec-fetch-site')
	});
	if (refused) return toResponse(refused);

	// Probes and error reports don't need a viewer, so they never touch the sessions.
	if (noViewerRoutes.has(route)) return resolve(event, resolveOptions);

	const { viewer, cookies } = await auth.authenticate((name) => event.cookies.get(name));
	event.locals.viewer = viewer;
	for (const { name, value, maxAge, secure, sameSite } of cookies) {
		event.cookies.set(name, value, { path: '/', maxAge, httpOnly: true, secure, sameSite });
	}
	const isApi = event.url.pathname.startsWith('/api/');
	if (!viewer && !publicApiRoutes.has(route) && isApi) {
		return unauthenticated();
	}
	if (viewer && isApi) {
		const userId = viewer.auth.userId;
		const { method } = event.request;
		const limited = edge.checkWriteRate({ method, userId });
		if (limited) return toResponse(limited);
		if (!termsFreeWrites.has(`${method} ${route}`)) {
			const refused = auth.checkTerms({
				method,
				accepted: viewer.termsVersion,
				current: terms.version
			});
			if (refused) return toResponse(refused);
		}
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
