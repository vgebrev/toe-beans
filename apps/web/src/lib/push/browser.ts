// The browser side of reminders (ui.md J7): whether this browser can have them, what to call
// this device, which phone maker's battery steps to show, and subscribing. Nothing here asks for
// permission on its own: only `subscribe`, called from a tap, does.
import type { SeenPushDevice } from '@toe-beans/contracts';

export type Support = 'supported' | 'unsupported';

export function pushSupport(): Support {
	if (typeof window === 'undefined') return 'unsupported';
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
		? 'supported'
		: 'unsupported';
}

/** Running as the installed app rather than in a browser tab. */
export const isInstalled = (): boolean =>
	typeof window !== 'undefined' &&
	(window.matchMedia('(display-mode: standalone)').matches ||
		window.matchMedia('(display-mode: minimal-ui)').matches);

export type Maker = 'samsung' | 'xiaomi' | 'other';

/**
 * The phone's maker from its model, as Chrome reports it: Samsung's start SM- (SM-S711B is the
 * S23 FE); Xiaomi's, Redmi's and POCO's are named or a long number (22101316G is the Redmi Note
 * 12 Pro).
 */
export function makerOf(model: string | undefined): Maker {
	if (!model) return 'other';
	if (/^SM-|galaxy|samsung/i.test(model)) return 'samsung';
	if (/redmi|poco|xiaomi|^mi\s|^\d{5,}[a-z]{0,3}$/i.test(model)) return 'xiaomi';
	return 'other';
}

/** e.g. "Galaxy SM-S711B · Chrome", so people can tell their devices apart. */
export function deviceLabel(model: string | undefined, userAgent: string): string {
	const browser = /Edg\//.test(userAgent)
		? 'Edge'
		: /Firefox\//.test(userAgent)
			? 'Firefox'
			: /SamsungBrowser\//.test(userAgent)
				? 'Samsung Internet'
				: /Chrome\//.test(userAgent)
					? 'Chrome'
					: 'Browser';
	const device =
		model?.trim() ||
		(/Android/.test(userAgent)
			? 'Android phone'
			: /iPhone|iPad/.test(userAgent)
				? 'iPhone'
				: /Windows/.test(userAgent)
					? 'Windows computer'
					: /Mac OS X/.test(userAgent)
						? 'Mac'
						: 'Computer');
	return `${device} · ${browser}`;
}

interface UADataLike {
	getHighEntropyValues?(hints: string[]): Promise<{ model?: string }>;
}

/** The phone model where Chrome reports it (`navigator.userAgentData`), else undefined. */
export async function phoneModel(): Promise<string | undefined> {
	const data = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
	try {
		return (await data?.getHighEntropyValues?.(['model']))?.model || undefined;
	} catch {
		return undefined;
	}
}

const toBase64url = (buffer: ArrayBuffer | null): string =>
	buffer
		? btoa(String.fromCharCode(...new Uint8Array(buffer)))
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=+$/, '')
		: '';

/** Whether a subscription was made with this server key; one from an old key can't be sent to. */
export const madeWithKey = (subscription: PushSubscription, publicKey: string): boolean =>
	toBase64url(subscription.options.applicationServerKey) === publicKey;

/** The service worker, or null if it isn't running within a few seconds. */
async function registration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration | null> {
	return Promise.race([
		navigator.serviceWorker.ready,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
	]);
}

/** This browser's current subscription, if it has one made with this key. */
export async function currentSubscription(publicKey: string): Promise<PushSubscription | null> {
	const reg = await registration();
	const subscription = (await reg?.pushManager.getSubscription()) ?? null;
	return subscription && madeWithKey(subscription, publicKey) ? subscription : null;
}

/**
 * Subscribes this browser, asking for permission if it hasn't been given. Call it from a tap
 * only. Null if permission was refused or the browser couldn't subscribe.
 */
export async function subscribe(
	publicKey: string
): Promise<
	{ ok: true; subscription: PushSubscription } | { ok: false; reason: 'denied' | 'failed' }
> {
	if (Notification.permission !== 'granted') {
		const answer = await Notification.requestPermission();
		if (answer !== 'granted')
			return { ok: false, reason: answer === 'denied' ? 'denied' : 'failed' };
	}
	try {
		const reg = await registration();
		if (!reg) return { ok: false, reason: 'failed' };
		const existing = await reg.pushManager.getSubscription();
		if (existing && madeWithKey(existing, publicKey)) return { ok: true, subscription: existing };
		// Made with another key (the server's changed): it can't be sent to, so start again.
		await existing?.unsubscribe();
		const subscription = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: publicKey
		});
		return { ok: true, subscription };
	} catch {
		return { ok: false, reason: 'failed' };
	}
}

/** Stops this browser's subscription: the push service then refuses sends, and the server stops. */
export async function unsubscribe(): Promise<void> {
	const reg = await registration(3_000);
	await (await reg?.pushManager.getSubscription())?.unsubscribe();
}

/** This browser's push endpoint, for signing out to name its device (architecture D43). */
export async function currentEndpoint(): Promise<string | null> {
	const reg = await registration(3_000);
	return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}

/**
 * What `POST /reminders/devices/seen` takes: this browser's subscription with its label and the
 * key it was made with, or null if it has none (architecture D43). Asks for nothing.
 */
export async function seenBody(model?: string): Promise<SeenPushDevice | null> {
	if (pushSupport() === 'unsupported' || Notification.permission !== 'granted') return null;
	const reg = await registration();
	const subscription = await reg?.pushManager.getSubscription();
	if (!subscription) return null;
	const { endpoint, keys } = subscription.toJSON();
	if (!endpoint || !keys?.p256dh || !keys.auth) return null;
	return {
		endpoint,
		keys: { p256dh: keys.p256dh, auth: keys.auth },
		label: deviceLabel(model ?? (await phoneModel()), navigator.userAgent),
		serverKey: toBase64url(subscription.options.applicationServerKey)
	};
}
