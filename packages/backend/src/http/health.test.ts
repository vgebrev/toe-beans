import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../application/ports/index.js';
import { createHealthHttp, READINESS_FRESH_MS } from './health.js';

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

const T0 = Date.UTC(2026, 10, 24, 12);
const at = (ms: number) => ({ now: () => new Date(ms) });

describe('readiness', () => {
	it('is 200 when the check passes', async () => {
		const http = createHealthHttp({
			readiness: { check: async () => {} },
			logger: logger(),
			clock: at(T0)
		});
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
			logger: log,
			clock: at(T0)
		});
		const response = await http.readiness();
		expect(response).toMatchObject({ status: 503, body: { status: 'unavailable' } });
		expect(JSON.stringify(response)).not.toContain('timed out');
		expect(log.warn).toHaveBeenCalledWith('not ready', { err });
	});

	it('pings the database once for every call in a few seconds (security audit R4)', async () => {
		let now = T0;
		const check = vi.fn(async () => {});
		const http = createHealthHttp({
			readiness: { check },
			logger: logger(),
			clock: { now: () => new Date(now) }
		});
		await Promise.all([http.readiness(), http.readiness(), http.readiness()]);
		now = T0 + READINESS_FRESH_MS - 1;
		expect(await http.readiness()).toMatchObject({ status: 200 });
		expect(check).toHaveBeenCalledTimes(1);
		now = T0 + READINESS_FRESH_MS;
		await http.readiness();
		expect(check).toHaveBeenCalledTimes(2);
	});

	it('keeps an outage for the same few seconds, then checks again', async () => {
		let now = T0;
		let up = false;
		const http = createHealthHttp({
			readiness: { check: async () => (up ? undefined : Promise.reject(new Error('down'))) },
			logger: logger(),
			clock: { now: () => new Date(now) }
		});
		expect(await http.readiness()).toMatchObject({ status: 503 });
		up = true;
		expect(await http.readiness()).toMatchObject({ status: 503 });
		now = T0 + READINESS_FRESH_MS;
		expect(await http.readiness()).toMatchObject({ status: 200 });
	});
});
