// The PushSender port over Web Push with VAPID (architecture §6.2). `web-push` encrypts the
// payload (RFC 8291) and signs the VAPID JWT; the request itself is a plain fetch, so it has a
// timeout and tests can point it at a local push service. Urgency is always `high`: reminders are
// time-bound, and Android demotes `normal` ones on a sleeping phone (§6.4).
import webpush from 'web-push';
import type { PushSender } from '../../application/ports/index.js';

export interface VapidKeys {
	publicKey: string;
	privateKey: string;
	/** A `mailto:` or https URL the push service can reach the sender at. */
	subject: string;
}

export interface WebPushOptions {
	vapid: VapidKeys;
	fetch?: typeof globalThis.fetch;
}

const TIMEOUT_MS = 10_000;

export function webPushSender({ vapid, fetch = globalThis.fetch }: WebPushOptions): PushSender {
	return {
		publicKey: vapid.publicKey,
		async send(device, payload, { ttlSeconds }) {
			try {
				const request = webpush.generateRequestDetails(
					{ endpoint: device.endpoint, keys: device.keys },
					JSON.stringify(payload),
					{
						TTL: ttlSeconds,
						urgency: 'high',
						contentEncoding: 'aes128gcm',
						vapidDetails: vapid
					}
				);
				const response = await fetch(request.endpoint, {
					method: request.method,
					headers: request.headers as Record<string, string>,
					body: new Uint8Array(request.body),
					signal: AbortSignal.timeout(TIMEOUT_MS)
				});
				await response.body?.cancel();
				if (response.ok) return { kind: 'sent' };
				if (response.status === 404 || response.status === 410) {
					return { kind: 'gone', status: response.status };
				}
				// The status only: the body can quote the endpoint.
				return { kind: 'failed', reason: `push ${response.status}` };
			} catch (e) {
				return { kind: 'failed', reason: e instanceof Error ? e.name : 'unknown' };
			}
		}
	};
}

/** A fresh key pair, for a local run that has none configured (`pnpm vapid` writes lasting ones). */
export const generateVapidKeys = (): Pick<VapidKeys, 'publicKey' | 'privateKey'> =>
	webpush.generateVAPIDKeys();
