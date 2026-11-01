import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../application/ports/index.js';
import { createHealthHttp } from './health.js';

const logger = (): Logger => {
	const l: Logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: () => l
	};
	return l;
};

describe('readiness', () => {
	it('is 200 when the check passes', async () => {
		const http = createHealthHttp({ readiness: { check: async () => {} }, logger: logger() });
		expect(await http.readiness()).toMatchObject({
			status: 200,
			headers: { 'cache-control': 'no-store' },
			body: { status: 'ready' }
		});
	});

	it('is 503 without the reason, which goes to the log', async () => {
		const log = logger();
		const err = new Error('server selection timed out');
		const http = createHealthHttp({
			readiness: { check: () => Promise.reject(err) },
			logger: log
		});
		const response = await http.readiness();
		expect(response).toMatchObject({ status: 503, body: { status: 'unavailable' } });
		expect(JSON.stringify(response)).not.toContain('timed out');
		expect(log.warn).toHaveBeenCalledWith('not ready', { err });
	});
});
