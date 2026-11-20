// The browser's error reports, posted to the app's own origin and sent on to error tracking
// (architecture D41). Open to anyone, signed in or not, since a sign-in page can fail too, so it
// is bounded per client address and by size before anything is read or sent.
import { rateLimited } from '../application/errors.js';
import type { ErrorRelay, Logger, RateLimiter } from '../application/ports/index.js';
import { errorResponse, type HttpResponse } from './response.js';

/** An error event is a few KB; Sentry's own limit for one is far above what a phone should send. */
export const MAX_ERROR_REPORT_BYTES = 256 * 1024;

export interface ErrorRelayHttp {
	relay(input: {
		clientAddress: string;
		/** The Content-Length header, if any. */
		contentLength: string | null;
		readBody(): Promise<Uint8Array<ArrayBuffer>>;
	}): Promise<HttpResponse>;
}

const plain = (status: number, headers: Record<string, string> = {}): HttpResponse => ({
	status,
	headers: { 'cache-control': 'no-store', ...headers }
});

export function createErrorRelayHttp({
	relay,
	rateLimit,
	logger
}: {
	relay: ErrorRelay;
	rateLimit: RateLimiter;
	logger: Logger;
}): ErrorRelayHttp {
	const log = logger.child({ component: 'error-relay' });
	return {
		async relay({ clientAddress, contentLength, readBody }) {
			if (!relay.enabled) return plain(404);
			const decision = rateLimit.take(clientAddress);
			if (!decision.allowed) {
				log.warn('error reports rate limited', {
					retryAfterSeconds: decision.retryAfterSeconds
				});
				const limited = errorResponse(rateLimited);
				return {
					...limited,
					headers: { ...limited.headers, 'retry-after': String(decision.retryAfterSeconds) }
				};
			}
			if (Number(contentLength) > MAX_ERROR_REPORT_BYTES) return plain(413);
			let body: Uint8Array<ArrayBuffer>;
			try {
				body = await readBody();
			} catch {
				// Kit's body limit, or the browser gave up.
				return plain(413);
			}
			if (body.byteLength > MAX_ERROR_REPORT_BYTES) return plain(413);
			const outcome = await relay.relay(body);
			switch (outcome.kind) {
				case 'sent':
					return plain(outcome.status, outcome.headers);
				case 'refused':
					return plain(400);
				case 'failed':
					return plain(502);
			}
		}
	};
}
