// What the service worker does with a push (architecture §6.2, ui.md §6.2), kept here as plain
// functions so it's tested without a service worker. The server sends minimal data: a title and
// body to show, the path to open, and the reminder's ID to report its arrival with.

export interface PushPayload {
	reminderId: string;
	kind: 'training' | 'test';
	title: string;
	body: string;
	/** In the app, no leading slash, e.g. `sessions/…`. */
	path: string;
	tag: string;
}

const isPayload = (value: unknown): value is PushPayload => {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return ['reminderId', 'kind', 'title', 'body', 'path', 'tag'].every(
		(key) => typeof v[key] === 'string'
	);
};

/** The payload, or null for anything else (an empty or foreign push). */
export function readPayload(text: string | undefined): PushPayload | null {
	if (!text) return null;
	try {
		const value: unknown = JSON.parse(text);
		return isPayload(value) ? value : null;
	} catch {
		return null;
	}
}

/**
 * The page to open: always inside the app's scope, so a payload can't send the app anywhere
 * else. Anything that would leave it opens Today.
 */
export function targetUrl(path: string, scope: string): string {
	const url = new URL(path, scope);
	return url.origin === new URL(scope).origin && url.href.startsWith(scope) ? url.href : scope;
}

/** The arrival report's URL (ui.md J7). */
export const receiptUrl = (reminderId: string, scope: string): string =>
	new URL(`api/v1/reminders/${encodeURIComponent(reminderId)}/received`, scope).href;

/**
 * How it shows (ui.md §6.2). The tag replaces an earlier notification for the same item, and
 * `renotify` makes a replacement buzz again rather than update silently.
 */
export function notificationOptions(
	payload: PushPayload,
	icons: { icon: string; badge: string }
): NotificationOptions & { renotify?: boolean } {
	return {
		body: payload.body,
		icon: icons.icon,
		badge: icons.badge,
		tag: payload.tag,
		renotify: true,
		data: { path: payload.path, reminderId: payload.reminderId }
	};
}

/** Shown for a push the app can't read, so Chrome doesn't show its own generic one. */
export const FALLBACK = { title: 'Toe Beans', body: 'Open Toe Beans to see what’s due.' };
