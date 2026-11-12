// A stand-in push service for e2e (architecture §6.2): the app sends reminders to it as it would
// to FCM, and tests read back what arrived and decrypt it (RFC 8291) with the keys their fake
// browser subscription holds. Started once by Playwright's global setup; the app is allowed to
// send to it through PUSH_SERVICE_ORIGINS.
import { createDecipheriv, createECDH, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Page } from '@playwright/test';

export const PUSH_SERVICE_PORT = 4174;
export const PUSH_SERVICE_ORIGIN = `http://localhost:${PUSH_SERVICE_PORT}`;

interface Received {
	headers: Record<string, string | string[] | undefined>;
	body: string;
}

/** Playwright global setup: the push service, until the run ends. */
export default async function start(): Promise<() => Promise<void>> {
	const received = new Map<string, Received[]>();
	const server = createServer((req, res) => {
		const id = req.url?.match(/^\/push\/([\w-]+)$/)?.[1];
		if (req.method === 'POST' && id) {
			const chunks: Buffer[] = [];
			req.on('data', (c: Buffer) => chunks.push(c));
			req.on('end', () => {
				const list = received.get(id) ?? [];
				list.push({ headers: req.headers, body: Buffer.concat(chunks).toString('base64') });
				received.set(id, list);
				// A subscription named gone-… answers as if the app had been uninstalled.
				res.writeHead(id.startsWith('gone-') ? 410 : 201).end();
			});
			return;
		}
		if (req.method === 'GET' && id) {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify(received.get(id) ?? []));
			return;
		}
		res.writeHead(404).end();
	});
	await new Promise<void>((resolve) => server.listen(PUSH_SERVICE_PORT, resolve));
	return () => new Promise((resolve) => server.close(() => resolve()));
}

/** What a browser holds for one subscription: the endpoint and the keys to decrypt with. */
export interface FakeSubscription {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	privateKey: Buffer;
	publicKey: Buffer;
	authSecret: Buffer;
}

export function fakeSubscription(prefix = ''): FakeSubscription {
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	const authSecret = randomBytes(16);
	const id = `${prefix}${randomUUID()}`;
	return {
		id,
		endpoint: `${PUSH_SERVICE_ORIGIN}/push/${id}`,
		p256dh: ecdh.getPublicKey().toString('base64url'),
		auth: authSecret.toString('base64url'),
		privateKey: ecdh.getPrivateKey(),
		publicKey: ecdh.getPublicKey(),
		authSecret
	};
}

/**
 * Makes the page's browser behave as if it could subscribe: Notification permission starts as
 * `permission` and a request grants it, and the PushManager hands out this subscription. The
 * service worker itself is real.
 */
export async function fakePushInBrowser(
	page: Page,
	sub: FakeSubscription | null,
	permission: NotificationPermission = 'default'
): Promise<void> {
	await page.addInitScript(
		({ sub, permission }) => {
			// Like a real browser, a subscription and the permission behind it outlive a reload.
			const STORED = 'e2e:fake-push-key';
			const stored = sessionStorage.getItem(STORED);
			let granted: NotificationPermission = stored ? 'granted' : permission;
			Object.defineProperty(Notification, 'permission', { get: () => granted, configurable: true });
			Notification.requestPermission = async () => (granted = 'granted');
			const bytes = (s: string) =>
				Uint8Array.from(
					atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)),
					(c) => c.charCodeAt(0)
				).buffer;
			const base64url = (buffer: ArrayBuffer) =>
				btoa(String.fromCharCode(...new Uint8Array(buffer)))
					.replace(/\+/g, '-')
					.replace(/\//g, '_')
					.replace(/=+$/, '');
			const make = (key: ArrayBuffer) => {
				if (!sub) throw new DOMException('push service unavailable', 'AbortError');
				return {
					endpoint: sub.endpoint,
					expirationTime: null,
					options: { userVisibleOnly: true, applicationServerKey: key },
					getKey: (name: string) => bytes(name === 'p256dh' ? sub.p256dh : sub.auth),
					toJSON: () => ({
						endpoint: sub.endpoint,
						expirationTime: null,
						keys: { p256dh: sub.p256dh, auth: sub.auth }
					}),
					unsubscribe: async () => {
						current = null;
						sessionStorage.removeItem(STORED);
						return true;
					}
				};
			};
			let current: unknown = stored && sub ? make(bytes(stored)) : null;
			PushManager.prototype.getSubscription = async () => current as PushSubscription | null;
			PushManager.prototype.subscribe = async function (options) {
				const given = options?.applicationServerKey;
				const key = typeof given === 'string' ? bytes(given) : (given as ArrayBuffer | undefined)!;
				current = make(key);
				sessionStorage.setItem(STORED, base64url(key));
				return current as PushSubscription;
			};
		},
		{
			sub: sub && { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
			permission
		}
	);
}

const hmac = (key: Buffer, ...data: Buffer[]) => {
	const h = createHmac('sha256', key);
	for (const d of data) h.update(d);
	return h.digest();
};

/** Decrypts an aes128gcm push body (RFC 8188, RFC 8291) for this subscription. */
export function decrypt(sub: FakeSubscription, body: Buffer): string {
	const salt = body.subarray(0, 16);
	const idLength = body[20]!;
	const serverKey = body.subarray(21, 21 + idLength);
	const ciphertext = body.subarray(21 + idLength);
	const ecdh = createECDH('prime256v1');
	ecdh.setPrivateKey(sub.privateKey);
	const shared = ecdh.computeSecret(serverKey);
	const prkKey = hmac(sub.authSecret, shared);
	const info = Buffer.concat([Buffer.from('WebPush: info\0'), sub.publicKey, serverKey]);
	const ikm = hmac(prkKey, info, Buffer.from([1]));
	const prk = hmac(salt, ikm);
	const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])).subarray(
		0,
		16
	);
	const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])).subarray(
		0,
		12
	);
	const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
	decipher.setAuthTag(ciphertext.subarray(-16));
	const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
	// The last record ends with a 0x02 delimiter, then any zero padding.
	let end = padded.length - 1;
	while (end >= 0 && padded[end] === 0) end--;
	return padded.subarray(0, end).toString();
}

export interface ReceivedPush {
	headers: Record<string, string | string[] | undefined>;
	payload: {
		reminderId: string;
		kind: string;
		title: string;
		body: string;
		path: string;
		tag: string;
	};
}

/** Every push the service has received for this subscription, decrypted. */
export async function pushesFor(sub: FakeSubscription): Promise<ReceivedPush[]> {
	const res = await fetch(`${PUSH_SERVICE_ORIGIN}/push/${sub.id}`);
	const list = (await res.json()) as Received[];
	return list.map((r) => ({
		headers: r.headers,
		payload: JSON.parse(decrypt(sub, Buffer.from(r.body, 'base64')))
	}));
}
