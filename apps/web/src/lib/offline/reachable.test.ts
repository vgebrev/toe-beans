import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHECK_TIMEOUT_MS, checkServer, READY_PATH } from './reachable.js';

/** A fetch that never answers, as on a connection that died while the phone slept. */
const hangs: typeof fetch = (_input, init) =>
	new Promise((_resolve, reject) =>
		init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
	);

describe('checkServer', () => {
	afterEach(() => vi.useRealTimers());

	it('asks the readiness path, which reaches the app on prod, never from the cache', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => new Response('{}'));
		expect(await checkServer(fetcher)).toBe('answered');
		expect(READY_PATH).toBe('/readyz');
		expect(fetcher).toHaveBeenCalledWith('/readyz', expect.objectContaining({ cache: 'no-store' }));
	});

	it('says what came back when the app answers with an error', async () => {
		expect(await checkServer(async () => new Response('', { status: 404 }))).toBe('status 404');
		expect(await checkServer(async () => new Response('', { status: 503 }))).toBe('status 503');
	});

	it('tells a failed request from one that got no answer in time', async () => {
		expect(
			await checkServer(async () => {
				throw new TypeError('Failed to fetch');
			})
		).toBe('no answer');

		vi.useFakeTimers();
		const check = checkServer(hangs);
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS - 1);
		let outcome: string | undefined;
		void check.then((o) => (outcome = o));
		await vi.advanceTimersByTimeAsync(0);
		expect(outcome).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		expect(await check).toBe('timed out');
	});
});
