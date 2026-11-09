/** The outcome of one attempt against a rate limit. */
export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Counts attempts per key, e.g. per client address, and refuses them once a key has used its
 * budget (architecture §7). The adapter is in memory and per instance.
 */
export interface RateLimiter {
	/** Uses one attempt for `key`, if it has any left. */
	take(key: string): RateLimitDecision;
}
