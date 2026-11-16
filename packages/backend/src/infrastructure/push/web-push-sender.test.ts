import { createECDH, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PushPayload } from '../../domain/reminders.js';
import { generateVapidKeys, webPushSender } from './web-push-sender.js';

const browser = createECDH('prime256v1');
browser.generateKeys();
const device = {
	endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
	keys: {
		p256dh: browser.getPublicKey().toString('base64url'),
		auth: randomBytes(16).toString('base64url')
	}
};
const payload: PushPayload = {
	reminderId: 'r1' as never,
	kind: 'training',
	title: 'Training time: Recall basics',
	body: 'Ripley · 17:30',
	path: 'sessions/s1',
	tag: 'session-s1'
};

function sender(status: number | Error) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		if (status instanceof Error) throw status;
		return new Response(null, { status });
	}) as typeof globalThis.fetch;
	const vapid = { ...generateVapidKeys(), subject: 'https://toebeans.co.za' };
	return { push: webPushSender({ vapid, fetch }), calls, vapid };
}

describe('webPushSender', () => {
	it('posts an encrypted, VAPID-signed push with high urgency and the TTL', async () => {
		const { push, calls, vapid } = sender(201);
		expect(await push.send(device, payload, { ttlSeconds: 3600 })).toEqual({ kind: 'sent' });
		expect(push.publicKey).toBe(vapid.publicKey);
		const [{ url, init }] = calls as [{ url: string; init: RequestInit }];
		expect(url).toBe(device.endpoint);
		expect(init.method).toBe('POST');
		const headers = init.headers as Record<string, string>;
		expect(headers).toMatchObject({
			TTL: 3600,
			Urgency: 'high',
			'Content-Encoding': 'aes128gcm'
		});
		expect(headers.Authorization).toMatch(new RegExp(`^vapid t=.+, k=${vapid.publicKey}$`));
		// Encrypted: the payload's text isn't in the body.
		expect(Buffer.from(init.body as Uint8Array).toString()).not.toContain('Ripley');
	});

	it('says a subscription is gone on 404 and 410', async () => {
		expect(await sender(410).push.send(device, payload, { ttlSeconds: 60 })).toEqual({
			kind: 'gone',
			status: 410
		});
		expect(await sender(404).push.send(device, payload, { ttlSeconds: 60 })).toEqual({
			kind: 'gone',
			status: 404
		});
	});

	it('reports other failures by status or error name only', async () => {
		expect(await sender(503).push.send(device, payload, { ttlSeconds: 60 })).toEqual({
			kind: 'failed',
			reason: 'push 503'
		});
		const timeout = Object.assign(new Error('https://fcm.googleapis.com/fcm/send/abc'), {
			name: 'TimeoutError'
		});
		expect(await sender(timeout).push.send(device, payload, { ttlSeconds: 60 })).toEqual({
			kind: 'failed',
			reason: 'TimeoutError'
		});
	});
});
