import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../application/ports/index.js';
import { httpHeartbeat } from './http-heartbeat.js';

const url = 'https://uptime.example/api/v1/heartbeat/secret-token';

function recordingLogger() {
	const lines: [string, Record<string, unknown> | undefined][] = [];
	const logger: Logger = {
		debug() {},
		info() {},
		warn: (message, fields) => void lines.push([message, fields]),
		error() {},
		child: () => logger
	};
	return { logger, lines };
}

describe('httpHeartbeat', () => {
	it('calls the URL and logs nothing when it answers', async () => {
		const { logger, lines } = recordingLogger();
		const fetch = vi.fn(async () => new Response('OK', { status: 200 }));
		await httpHeartbeat({ url, logger, fetch: fetch as never }).beat();
		expect(fetch).toHaveBeenCalledOnce();
		expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(url);
		expect(lines).toEqual([]);
	});

	it('logs a refusal or a failure without the URL, and never throws', async () => {
		const { logger, lines } = recordingLogger();
		const refused = vi.fn(async () => new Response('', { status: 404 }));
		await httpHeartbeat({ url, logger, fetch: refused as never }).beat();
		const down = vi.fn(async () => {
			throw new DOMException('timed out', 'TimeoutError');
		});
		await httpHeartbeat({ url, logger, fetch: down as never }).beat();
		expect(lines).toEqual([
			['heartbeat refused', { status: 404 }],
			['heartbeat failed', { reason: 'TimeoutError' }]
		]);
		expect(JSON.stringify(lines)).not.toContain('secret-token');
	});
});
