import { describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../../testing/logger.js';
import { sentryRelay } from './sentry-relay.js';

const dsn = 'https://abc123@o1.ingest.de.sentry.io/4507';

const envelope = (header: unknown, item = '{"type":"event"}\n{"message":"boom"}') =>
	new TextEncoder().encode(`${JSON.stringify(header)}\n${item}`);

const relayWith = (answer: () => Promise<Response>) => {
	const fetch = vi.fn((_url: string, _init: RequestInit) => answer());
	const relay = sentryRelay({ dsn, logger: silentLogger, fetch: fetch as never });
	return { relay, fetch };
};

describe('sentryRelay', () => {
	it("sends our project's envelope to its ingest host as it came, and nothing else", async () => {
		const { relay, fetch } = relayWith(async () => new Response('{}', { status: 200 }));
		const body = envelope({ event_id: 'e1', dsn, sent_at: '2026-11-20T00:00:00Z' });
		expect(await relay.relay(body)).toEqual({ kind: 'sent', status: 200, headers: {} });
		const [url, init] = fetch.mock.calls[0]!;
		expect(url).toBe(
			'https://o1.ingest.de.sentry.io/api/4507/envelope/?sentry_version=7&sentry_key=abc123'
		);
		expect(init.body).toBe(body);
		// No client address, Referer or cookies: only what says it's an envelope.
		expect(init.headers).toEqual({ 'content-type': 'application/x-sentry-envelope' });
	});

	it('keeps a DSN path prefix in the ingest URL', async () => {
		const prefixed = 'https://k@sentry.example/team/7';
		const fetch = vi.fn(async (_url: string) => new Response(null, { status: 200 }));
		const relay = sentryRelay({ dsn: prefixed, logger: silentLogger, fetch: fetch as never });
		await relay.relay(envelope({ dsn: prefixed }));
		expect(fetch.mock.calls[0]![0]).toBe(
			'https://sentry.example/team/api/7/envelope/?sentry_version=7&sentry_key=k'
		);
	});

	it('passes back what tells the SDK to back off', async () => {
		const { relay } = relayWith(
			async () =>
				new Response('', {
					status: 429,
					headers: { 'retry-after': '60', 'x-sentry-rate-limits': '60:error:key', server: 'x' }
				})
		);
		expect(await relay.relay(envelope({ dsn }))).toEqual({
			kind: 'sent',
			status: 429,
			headers: { 'retry-after': '60', 'x-sentry-rate-limits': '60:error:key' }
		});
	});

	it.each([
		['another project', envelope({ dsn: 'https://abc123@o1.ingest.de.sentry.io/9999' })],
		['another key', envelope({ dsn: 'https://other@o1.ingest.de.sentry.io/4507' })],
		['another host', envelope({ dsn: 'https://abc123@evil.example/4507' })],
		['no DSN', envelope({ event_id: 'e1' })],
		['a DSN that is not a string', envelope({ dsn: 4507 })],
		['a header that is not JSON', new TextEncoder().encode('{nope\n{}')],
		['no header line', new TextEncoder().encode(JSON.stringify({ dsn }))],
		['nothing', new Uint8Array()]
	])('refuses %s without sending anything', async (_, body) => {
		const { relay, fetch } = relayWith(async () => new Response());
		expect(await relay.relay(body)).toEqual({ kind: 'refused' });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('takes a DSN written with a trailing slash or a secret as the same project', async () => {
		const { relay } = relayWith(async () => new Response(null, { status: 200 }));
		const same = await relay.relay(
			envelope({ dsn: 'https://abc123:secret@o1.ingest.de.sentry.io/4507/' })
		);
		expect(same.kind).toBe('sent');
	});

	it("says so when Sentry doesn't answer, and never throws", async () => {
		const { relay } = relayWith(async () => {
			throw new DOMException('timed out', 'TimeoutError');
		});
		expect(await relay.relay(envelope({ dsn }))).toEqual({ kind: 'failed' });
	});

	it('refuses to start on something that is not a DSN', () => {
		expect(() =>
			sentryRelay({ dsn: 'https://o1.ingest.de.sentry.io/4507', logger: silentLogger })
		).toThrow();
		expect(() =>
			sentryRelay({ dsn: 'https://k@o1.ingest.de.sentry.io/', logger: silentLogger })
		).toThrow();
	});
});
