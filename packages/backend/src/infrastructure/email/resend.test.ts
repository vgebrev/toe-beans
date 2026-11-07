import { describe, expect, it, vi } from 'vitest';
import { RESEND_URL, resendEmailSender } from './resend.js';

const message = { to: 'jane@example.com', subject: 'Hello', text: 'Join us' };
const from = 'Toe Beans <invites@toebeans.example>';

describe('resendEmailSender', () => {
	it('posts the message with the API key', async () => {
		const fetch = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
		const sender = resendEmailSender({ apiKey: 're_key', from, fetch: fetch as never });
		expect(await sender.send(message)).toEqual({ ok: true, value: undefined });
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(RESEND_URL);
		expect(init.headers).toMatchObject({ authorization: 'Bearer re_key' });
		expect(JSON.parse(init.body as string)).toEqual({
			from,
			to: ['jane@example.com'],
			subject: 'Hello',
			text: 'Join us'
		});
	});

	it('reports a refusal by status only: the body can quote the address', async () => {
		const body = '{"message":"jane@example.com is not allowed"}';
		const fetch = vi.fn(async () => new Response(body, { status: 422 }));
		const sender = resendEmailSender({ apiKey: 'k', from, fetch: fetch as never });
		expect(await sender.send(message)).toEqual({ ok: false, error: { reason: 'resend 422' } });
	});

	it('turns a network failure into a result', async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		const sender = resendEmailSender({ apiKey: 'k', from, fetch: fetch as never });
		expect(await sender.send(message)).toEqual({ ok: false, error: { reason: 'TypeError' } });
	});
});
