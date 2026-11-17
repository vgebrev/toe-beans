// What every request passes before its route (architecture §7, security audit F1, F3, C3): the
// proxy's header secret, the per-person write budget, and the security headers on every response.
// The host calls these from its request hook; they hold no framework types (NFR-15).
import { createHash, timingSafeEqual } from 'node:crypto';
import { forbidden, rateLimited } from '../application/errors.js';
import type { Logger, RateLimiter } from '../application/ports/index.js';
import { errorResponse, type HttpResponse } from './response.js';

/** The header the Cloudflare Worker adds to every request it forwards (architecture §8.4). */
export const PROXY_SECRET_HEADER = 'x-toe-beans-proxy';

/** Methods that change nothing: no cross-site check (auth.ts) and no write budget. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const isSafeMethod = (method: string): boolean => SAFE_METHODS.has(method.toUpperCase());

export interface EdgeHttpOptions {
	/** e.g. `https://toebeans.co.za`. HSTS is sent only on https. */
	publicOrigin: string;
	/** Unset: requests are taken from anyone (local runs). */
	proxySecret?: string;
	/** Writes to the API per signed-in person. */
	writeRateLimit: RateLimiter;
	logger: Logger;
}

export interface EdgeHttp {
	/**
	 * Refuses a request that didn't come through the proxy, so one sent to `run.app` directly can't
	 * set the client address header the rate limits key on. Returns the 403, or null to carry on.
	 */
	checkProxy(secret: string | null): HttpResponse | null;
	/** Refuses a write over the person's budget (429), or null to carry on. */
	checkWriteRate(input: { method: string; userId: string }): HttpResponse | null;
	/** Headers for every response. The CSP itself comes from the host (Kit's nonces). */
	securityHeaders(): Record<string, string>;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function createEdgeHttp({
	publicOrigin,
	proxySecret,
	writeRateLimit,
	logger
}: EdgeHttpOptions): EdgeHttp {
	const log = logger.child({ component: 'edge' });
	// Compared as digests, so the comparison takes the same time whatever the length.
	const expected = proxySecret ? digest(proxySecret) : null;
	const headers: Record<string, string> = {
		'referrer-policy': 'same-origin',
		'x-content-type-options': 'nosniff',
		// Only the photo picker's camera; notifications aren't a Permissions-Policy feature. No
		// bluetooth: Chrome doesn't know it as one and warns on every page.
		'permissions-policy':
			'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=()',
		'cross-origin-opener-policy': 'same-origin',
		...(publicOrigin.startsWith('https:') && {
			// Two years. No includeSubDomains: other hosts on the domain aren't this app's to commit.
			'strict-transport-security': 'max-age=63072000'
		})
	};

	return {
		checkProxy(secret) {
			if (!expected) return null;
			if (secret && timingSafeEqual(digest(secret), expected)) return null;
			log.warn('request without the proxy secret refused');
			return errorResponse(forbidden);
		},

		checkWriteRate({ method, userId }) {
			if (isSafeMethod(method)) return null;
			const decision = writeRateLimit.take(userId);
			if (decision.allowed) return null;
			log.warn('write rate limited', { userId, retryAfterSeconds: decision.retryAfterSeconds });
			return errorResponse(rateLimited);
		},

		securityHeaders() {
			return { ...headers };
		}
	};
}
