import { describe, expect, it } from 'vitest';
import { manualClock } from '../../testing/clock.js';
import { memoryRateLimiter } from './memory-rate-limiter.js';

const MINUTE = 60_000;

describe('memoryRateLimiter', () => {
	it('allows a burst up to the limit, then refuses with when to retry', () => {
		const limiter = memoryRateLimiter({ limit: 3, windowMs: 3 * MINUTE, clock: manualClock() });
		for (let i = 0; i < 3; i++) expect(limiter.take('a')).toEqual({ allowed: true });
		expect(limiter.take('a')).toEqual({ allowed: false, retryAfterSeconds: 60 });
	});

	it('counts each key on its own', () => {
		const limiter = memoryRateLimiter({ limit: 1, windowMs: MINUTE, clock: manualClock() });
		expect(limiter.take('a').allowed).toBe(true);
		expect(limiter.take('a').allowed).toBe(false);
		expect(limiter.take('b').allowed).toBe(true);
	});

	it('gives attempts back as time passes, never more than the limit', () => {
		const clock = manualClock();
		const limiter = memoryRateLimiter({ limit: 2, windowMs: 2 * MINUTE, clock });
		limiter.take('a');
		limiter.take('a');
		clock.advance(30_000);
		expect(limiter.take('a')).toEqual({ allowed: false, retryAfterSeconds: 30 });
		clock.advance(30_000);
		expect(limiter.take('a').allowed).toBe(true);
		clock.advance(60 * MINUTE);
		expect(limiter.take('a').allowed).toBe(true);
		expect(limiter.take('a').allowed).toBe(true);
		expect(limiter.take('a').allowed).toBe(false);
	});

	it('refusals do not push the retry further away', () => {
		const clock = manualClock();
		const limiter = memoryRateLimiter({ limit: 1, windowMs: MINUTE, clock });
		limiter.take('a');
		for (let i = 0; i < 10; i++) limiter.take('a');
		clock.advance(MINUTE);
		expect(limiter.take('a').allowed).toBe(true);
	});

	it('keeps at most maxKeys, forgetting full buckets first, then the oldest', () => {
		const clock = manualClock();
		const limiter = memoryRateLimiter({ limit: 2, windowMs: MINUTE, clock, maxKeys: 2 });
		limiter.take('busy');
		limiter.take('busy');
		limiter.take('old');
		clock.advance(MINUTE); // 'old' and 'busy' refill
		limiter.take('busy');
		limiter.take('busy');
		limiter.take('new'); // drops 'old', which is full again
		expect(limiter.take('busy').allowed).toBe(false);
		limiter.take('newer'); // nothing is full: drops the oldest, 'busy'
		expect(limiter.take('busy').allowed).toBe(true);
	});
});
