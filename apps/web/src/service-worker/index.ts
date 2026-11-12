// The service worker (architecture §6.2). For now it only handles reminders: it shows each push
// as a notification, even with the app closed, reports its arrival, and opens the item when
// tapped. Caching and the offline page come with S13; until then every request goes to the
// network as if there were no service worker.
import { self } from '$app/service-worker';
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

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
