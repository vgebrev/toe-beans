import { describe, expect, it, vi } from 'vitest';
import { mailpitEmailSender } from './mailpit.js';

const message = { to: 'jane@example.com', subject: 'Hello', text: 'Join us' };
const url = 'http://localhost:8025';
const named = 'Toe Beans <invites@toebeans.example>';

describe('mailpitEmailSender', () => {
	it("posts the message in Mailpit's shape", async () => {
		const fetch = vi.fn(async () => new Response('{"ID":"1"}', { status: 200 }));
		const sender = mailpitEmailSender({ url, from: named, fetch: fetch as never });
		expect(await sender.send(message)).toEqual({ ok: true, value: undefined });
		const [target, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
		expect(target.href).toBe('http://localhost:8025/api/v1/send');
		expect(JSON.parse(init.body as string)).toEqual({
			From: { Email: 'invites@toebeans.example', Name: 'Toe Beans' },
			To: [{ Email: 'jane@example.com' }],
			Subject: 'Hello',
			Text: 'Join us'
		});
	});

	it('takes a bare address as the sender', async () => {
		const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
		const sender = mailpitEmailSender({ url, from: 'a@b.example', fetch: fetch as never });
		await sender.send(message);
		const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
		expect(JSON.parse(init.body as string).From).toEqual({ Email: 'a@b.example' });
	});

	it('reports a refusal, or Mailpit not running, as a result', async () => {
		const refused = vi.fn(async () => new Response('nope', { status: 400 }));
		expect(
			await mailpitEmailSender({ url, from: named, fetch: refused as never }).send(message)
		).toEqual({ ok: false, error: { reason: 'mailpit 400' } });
		const down = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		expect(
			await mailpitEmailSender({ url, from: named, fetch: down as never }).send(message)
		).toEqual({ ok: false, error: { reason: 'TypeError' } });
	});
});
