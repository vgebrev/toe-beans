import { describe, expect, it, vi } from 'vitest';
import type { ErrorRelay, RateLimiter } from '../application/ports/index.js';
import { silentLogger } from '../testing/logger.js';
import { createErrorRelayHttp, MAX_ERROR_REPORT_BYTES } from './error-relay.js';

const allowAll: RateLimiter = { take: () => ({ allowed: true }) };
const sentOk: ErrorRelay = {
	enabled: true,
	relay: async () => ({ kind: 'sent', status: 200, headers: {} })
};
const off: ErrorRelay = { enabled: false, relay: async () => ({ kind: 'refused' }) };
const body = new TextEncoder().encode('{"dsn":"x"}\n{}');

const http = (relay: ErrorRelay = sentOk, rateLimit: RateLimiter = allowAll) =>
	createErrorRelayHttp({ relay, rateLimit, logger: silentLogger });

const input = (overrides: Partial<Parameters<ReturnType<typeof http>['relay']>[0]> = {}) => ({
	clientAddress: '198.51.100.7',
	contentLength: String(body.byteLength),
	readBody: async () => body,
	...overrides
});

describe('the error relay route (architecture D41)', () => {
	it('answers 404 when error reporting is off, without reading the body', async () => {
		const readBody = vi.fn(async () => body);
		expect(await http(off).relay(input({ readBody }))).toMatchObject({ status: 404 });
		expect(readBody).not.toHaveBeenCalled();
	});

	it("passes on the body and answers with Sentry's status and back-off headers", async () => {
		const relay = vi.fn<ErrorRelay['relay']>(async () => ({
			kind: 'sent',
			status: 429,
			headers: { 'retry-after': '30' }
		}));
		const response = await http({ enabled: true, relay }).relay(input());
		expect(relay).toHaveBeenCalledWith(body);
		expect(response).toEqual({
			status: 429,
			headers: { 'cache-control': 'no-store', 'retry-after': '30' }
		});
	});

	it('counts reports per client address and refuses past the limit with when to retry', async () => {
		const take = vi.fn<RateLimiter['take']>(() => ({ allowed: false, retryAfterSeconds: 42 }));
		const readBody = vi.fn(async () => body);
		const response = await http(sentOk, { take }).relay(input({ readBody }));
		expect(take).toHaveBeenCalledWith('198.51.100.7');
		expect(response).toMatchObject({ status: 429, headers: { 'retry-after': '42' } });
		expect(readBody).not.toHaveBeenCalled();
	});

	it('refuses a report over the size limit, by its header or by what arrived', async () => {
		const relay = vi.fn(sentOk.relay);
		const big = new Uint8Array(MAX_ERROR_REPORT_BYTES + 1);
		const byHeader = await http({ enabled: true, relay }).relay(
			input({ contentLength: String(big.byteLength) })
		);
		const byBody = await http({ enabled: true, relay }).relay(
			input({ contentLength: null, readBody: async () => big })
		);
		const unreadable = await http({ enabled: true, relay }).relay(
			input({
				readBody: async () => {
					throw new Error('too big');
				}
			})
		);
		expect([byHeader.status, byBody.status, unreadable.status]).toEqual([413, 413, 413]);
		expect(relay).not.toHaveBeenCalled();
	});

	it('answers 400 for a refused envelope and 502 when Sentry is unreachable', async () => {
		const refused = await http({ enabled: true, relay: async () => ({ kind: 'refused' }) }).relay(
			input()
		);
		const failed = await http({ enabled: true, relay: async () => ({ kind: 'failed' }) }).relay(
			input()
		);
		expect([refused.status, failed.status]).toEqual([400, 502]);
	});
});
