import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailSender } from './index.js';
import { RESEND_URL } from './resend.js';

const from = 'Toe Beans <invites@toebeans.example>';
const message = { to: 'jane@example.com', subject: 'Hello', text: 'Join us' };

describe('createEmailSender', () => {
	afterEach(() => vi.unstubAllGlobals());

	const stubFetch = () => {
		const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		return fetch;
	};
	const target = (fetch: ReturnType<typeof stubFetch>) =>
		String((fetch.mock.calls[0] as unknown as [string | URL])[0]);

	it('sends where the config says, and nowhere else', async () => {
		const fetch = stubFetch();
		await createEmailSender({ kind: 'mailpit', url: 'http://mail.test:8025', from }).send(message);
		expect(target(fetch)).toBe('http://mail.test:8025/api/v1/send');

		fetch.mockClear();
		await createEmailSender({ kind: 'resend', apiKey: 'k', from }).send(message);
		expect(target(fetch)).toBe(RESEND_URL);
	});

	it('keeps the console sender off the network', async () => {
		const fetch = stubFetch();
		const print = vi.spyOn(console, 'info').mockImplementation(() => {});
		await createEmailSender({ kind: 'console' }).send(message);
		expect(fetch).not.toHaveBeenCalled();
		expect(print).toHaveBeenCalledOnce();
		print.mockRestore();
	});
});
