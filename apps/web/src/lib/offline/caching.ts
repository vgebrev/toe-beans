// What the service worker caches and when it falls back (architecture §7, ui.md §6.1), kept here
// as plain functions so it's tested without a service worker. Only the build's own files and
// the fallback pages are cached: never API responses, photos or pages with household data
// (NFR-04).

/** Each font comes in subsets; phones only ever load the Latin one (ui.md §6.4). */
const font = /\.woff2?$/;
const latinFont = /-latin-wght-normal\.[\w-]+\.woff2$/;

/** The files to precache, from Kit's manifest: everything but the non-Latin font subsets. */
export function precachePaths(paths: readonly string[]): string[] {
	return paths.filter((path) => !font.test(path) || latinFont.test(path));
}

/** Errors from a proxy or the platform (Cloudflare, Cloud Run), not from the app. */
export const isGatewayError = (status: number): boolean =>
	status === 502 || status === 503 || status === 504;

/**
 * How long a page load may take before the waking page stands in for it, and only after the
 * server has been quiet this long: then it's likely a cold start (architecture §8.4). Warm page
 * loads take a few hundred milliseconds on the phones (S-1.4), so a second is clearly slow.
 */
export const WAKING_AFTER_MS = 1000;
export const QUIET_FOR_MS = 60_000;

/**
 * How long a page load may go unanswered before *Can't reach Toe Beans* stands in for it (S17.11):
 * a request on a connection that died while the phone slept can otherwise hang for minutes.
 */
export const PAGE_TIMEOUT_MS = 20_000;

/** Whether a page load should race the waking page, given when the server last answered. */
export const mayBeCold = (now: number, lastAnswered: number | null): boolean =>
	lastAnswered === null || now - lastAnswered >= QUIET_FOR_MS;

/** Each build's precache is named after its version. */
export const CACHE_PREFIX = 'toe-beans-';

/**
 * The caches a newly active worker deletes: all but its own and the one before it (S17.2). A
 * page still open on the previous build lazily loads its route chunks, which the new server
 * doesn't have (each image holds only its own build), so they come from that build's cache
 * until the page reloads. Cache names come back in the order they were made.
 */
export function cachesToDelete(names: readonly string[], current: string): string[] {
	const ours = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
	return ours.slice(0, -1);
}
