// The service worker (architecture §6.2, §7). It shows each reminder push as a notification,
// even with the app closed, reports its arrival, and opens the item when tapped. It precaches the
// build's files and the fallback pages, and stands them in for a page load that fails: *You're
// offline* with no response, *Can't reach Toe Beans* on a gateway error, and the waking skeleton
// while a cold server starts (ui.md §5.2). Nothing else is cached: API responses, photos and
// pages go to the network every time (NFR-04).
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';
import { isGatewayError, mayBeCold, precachePaths, WAKING_AFTER_MS } from '#lib/offline/caching.js';
import {
	FALLBACK,
	notificationOptions,
	readPayload,
	receiptUrl,
	targetUrl
} from '#lib/push/notification.js';

const scope = () => self.registration.scope;
const icons = () => ({
	icon: new URL('icons/icon-192.png', scope()).href,
	badge: new URL('icons/badge-96.png', scope()).href
});

const CACHE = `toe-beans-${version}`;
// Manifest paths are relative to the base path, which is where this worker is served from.
const toPath = (path: string) => new URL(path, self.location.href).pathname;
const OFFLINE = toPath('offline');
const UNREACHABLE = toPath('unreachable');
const WAKING = toPath('waking');
const HEALTHZ = toPath('healthz');
const AUTH = toPath('auth/');
const PRECACHE = [
	...precachePaths([...immutable, ...assets].map((f) => f.path)),
	'offline',
	'unreachable',
	'waking'
].map(toPath);
const PRECACHED = new Set(PRECACHE);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

const cached = async (path: string) => (await caches.open(CACHE)).match(path);

/** When the app last answered, in this worker's lifetime (Chrome stops it when idle). */
let lastAnswered: number | null = null;

/**
 * A page load: the network, or a fallback page in its place. After a quiet spell a load that
 * takes over a second gets the waking skeleton meanwhile, which loads the page again once the
 * server answers; by then it has answered, so that load goes straight through. Sign-in's own
 * steps are never raced: a callback's code works once, so it can't be loaded again.
 */
async function navigate(request: Request, url: URL): Promise<Response> {
	const network = fetch(request).then(
		async (response) => {
			if (isGatewayError(response.status)) return (await cached(UNREACHABLE)) ?? response;
			lastAnswered = Date.now();
			return response;
		},
		async () => (await cached(OFFLINE)) ?? Response.error()
	);
	if (url.pathname.startsWith(AUTH) || !mayBeCold(Date.now(), lastAnswered)) return network;

	const waking = new Promise<Response | undefined>((resolve) =>
		setTimeout(() => resolve(cached(WAKING)), WAKING_AFTER_MS)
	);
	return (await Promise.race([network, waking])) ?? network;
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(navigate(request, url));
	} else if (url.pathname === HEALTHZ) {
		// The waking page asking whether the server is up: an answer means it is.
		event.respondWith(
			fetch(request).then((response) => {
				if (response.ok) lastAnswered = Date.now();
				return response;
			})
		);
	} else if (PRECACHED.has(url.pathname)) {
		event.respondWith(cached(url.pathname).then((hit) => hit ?? fetch(request)));
	}
});

self.addEventListener('push', (event) => {
	const payload = readPayload(event.data?.text());
	if (!payload) {
		event.waitUntil(
			self.registration.showNotification(FALLBACK.title, { ...FALLBACK, ...icons() })
		);
		return;
	}
	event.waitUntil(
		Promise.all([
			self.registration.showNotification(payload.title, notificationOptions(payload, icons())),
			// Same origin, so the session cookie goes with it. A failure only loses the report.
			fetch(receiptUrl(payload.reminderId, scope()), { method: 'POST' }).catch(() => undefined)
		])
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const path = (event.notification.data as { path?: unknown } | null)?.path;
	const target = targetUrl(typeof path === 'string' ? path : '', scope());
	// Always openWindow: Android hands in-scope URLs to the installed app, and the manifest's
	// launch_handler reuses its window. Focusing a client instead can pick a plain Chrome tab, as
	// the Clients API can't tell one from the app's window (spike S-1.2).
	event.waitUntil(self.clients.openWindow(target));
});

// The push service renewed the subscription: save the new one, or reminders stop until the
// Notifications screen next opens. Chrome rarely fires this; the screen re-saves anyway.
self.addEventListener('pushsubscriptionchange', (event) => {
	const change = event as Event & {
		oldSubscription?: PushSubscription | null;
		waitUntil(p: Promise<unknown>): void;
	};
	const key = change.oldSubscription?.options.applicationServerKey;
	if (!key) return;
	change.waitUntil(
		self.registration.pushManager
			.subscribe({ userVisibleOnly: true, applicationServerKey: key })
			.then((subscription) =>
				fetch(new URL('api/v1/reminders/devices', scope()), {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(subscription.toJSON())
				})
			)
			.catch(() => undefined)
	);
});
