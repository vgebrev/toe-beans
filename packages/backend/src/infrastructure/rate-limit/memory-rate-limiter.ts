// The RateLimiter port in process memory (architecture §7): a token bucket per key. Each instance
// counts on its own, which is acceptable at this scale; the state is a disposable cache, so a
// restart only forgets who was close to their limit.
import type { Clock, RateLimiter } from '../../application/ports/index.js';

export interface MemoryRateLimiterOptions {
	/** Attempts a key may make in a burst, and per `windowMs` on average. */
	limit: number;
	windowMs: number;
	clock: Clock;
	/** Keys tracked at most, so a flood of addresses can't grow memory without bound. */
	maxKeys?: number;
}

interface Bucket {
	tokens: number;
	updatedAt: number;
}

export function memoryRateLimiter({
	limit,
	windowMs,
	clock,
	maxKeys = 10_000
}: MemoryRateLimiterOptions): RateLimiter {
	if (!(limit >= 1) || !(windowMs > 0)) throw new Error('limit and windowMs must be positive');
	const buckets = new Map<string, Bucket>();

	const refilled = (bucket: Bucket, now: number) =>
		Math.min(limit, bucket.tokens + ((now - bucket.updatedAt) * limit) / windowMs);

	/** Drops full buckets (they're the same as no bucket), then the oldest if still too many. */
	const makeRoom = (now: number) => {
		for (const [key, bucket] of buckets) {
			if (refilled(bucket, now) >= limit) buckets.delete(key);
		}
		for (const key of buckets.keys()) {
			if (buckets.size < maxKeys) break;
			buckets.delete(key);
		}
	};

	return {
		take(key) {
			const now = clock.now().getTime();
			let bucket = buckets.get(key);
			if (!bucket) {
				if (buckets.size >= maxKeys) makeRoom(now);
				bucket = { tokens: limit, updatedAt: now };
				buckets.set(key, bucket);
			} else {
				bucket.tokens = refilled(bucket, now);
				bucket.updatedAt = now;
			}
			if (bucket.tokens >= 1) {
				bucket.tokens -= 1;
				return { allowed: true };
			}
			return {
				allowed: false,
				retryAfterSeconds: Math.max(1, Math.ceil(((1 - bucket.tokens) * windowMs) / limit / 1000))
			};
		}
	};
}
