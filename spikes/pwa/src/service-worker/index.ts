// Spike S-1.1/S-1.2 service worker. Precaches build output, static files and the offline page.
// Navigations go network-first and fall back to /offline. Anything else (future /api/*, photos)
// is never cached (architecture §7: no stale personal data, no false "saved").
import { self } from '$app/service-worker';
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `toe-beans-${version}`;
// Manifest paths are relative to the base path, which is where this worker is served from.
const toPath = (path: string) => new URL(path, self.location.href).pathname;
const OFFLINE = toPath('offline');
const PRECACHE = [...immutable, ...assets, ...prerendered].map((f) => toPath(f.path));
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

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error())
		);
		return;
	}

	if (PRECACHED.has(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
	}
});

// S-1.2: show pushes even when no window is open, and report receipt so delivery can be timed.
type PushPayload = { pushId: string; device: string; sentAt: string; title: string; body: string; url: string };

const ack = (event: 'received' | 'clicked', p: Partial<PushPayload>) =>
	fetch('/api/push/ack', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ event, pushId: p.pushId, device: p.device, sentAt: p.sentAt })
	}).catch(() => undefined);

self.addEventListener('push', (event) => {
	const p: PushPayload = event.data?.json() ?? { title: 'Toe Beans', body: '', url: '/' };
	event.waitUntil(
		Promise.all([
			self.registration.showNotification(p.title, {
				body: p.body,
				icon: '/icons/icon-192.png',
				badge: '/icons/badge-96.png',
				tag: p.pushId,
				data: p
			}),
			ack('received', p)
		])
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const p: PushPayload = event.notification.data;
	const target = new URL(p?.url ?? '/', self.location.origin).href;
	// Always openWindow: on Android, Chrome hands in-scope URLs to the installed app. Focusing an
	// existing client instead can pick a plain Chrome tab on the same origin, since the Clients API
	// can't tell a browser tab from the standalone window.
	event.waitUntil(Promise.all([self.clients.openWindow(target), ack('clicked', p)]));
});
