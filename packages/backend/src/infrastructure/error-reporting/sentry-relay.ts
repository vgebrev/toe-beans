// The browser's error reports, sent on to Sentry from the server (architecture D41): ad blockers
// block `*.ingest.sentry.io`, so the browser SDK posts to the app's own origin instead. Only
// envelopes for the configured DSN go anywhere, and only to that DSN's ingest host, so the route
// can't be used to send requests elsewhere. Nothing from the browser's request goes with them: no
// address, no Referer (it can hold an invite token), no cookies. The user agent Sentry shows is
// inside the event itself. Written here rather than with the SDK's `handleTunnelRequest`, which
// passes on the client's address and Referer.
import type { ErrorRelay, ErrorRelayOutcome, Logger } from '../../application/ports/index.js';

export interface SentryRelayOptions {
	/** The project's DSN, e.g. `https://key@o1.ingest.de.sentry.io/2`. */
	dsn: string;
	logger: Logger;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

/** The envelope's first line is a JSON header; anything longer isn't one from the SDK. */
const MAX_HEADER_BYTES = 16 * 1024;
const NEWLINE = 10;
/** What tells the SDK to back off, passed back to it as Sentry sent it. */
const BACK_OFF_HEADERS = ['retry-after', 'x-sentry-rate-limits'];

interface Dsn {
	/** protocol, key, host and path, which identify the project. */
	identity: string;
	ingestUrl: string;
}

function parseDsn(value: string): Dsn | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	const segments = url.pathname.split('/').filter(Boolean);
	const projectId = segments.pop();
	if (!url.username || !projectId || !/^\d+$/.test(projectId)) return undefined;
	const prefix = segments.map((s) => `${s}/`).join('');
	const ingest = new URL(`/${prefix}api/${projectId}/envelope/`, url.origin);
	ingest.search = new URLSearchParams({ sentry_version: '7', sentry_key: url.username }).toString();
	return {
		identity: `${url.protocol}//${url.username}@${url.host}/${prefix}${projectId}`,
		ingestUrl: ingest.toString()
	};
}

/** The DSN in the envelope's header, or undefined when it isn't an envelope. */
function envelopeDsn(envelope: Uint8Array): string | undefined {
	const end = envelope.subarray(0, MAX_HEADER_BYTES + 1).indexOf(NEWLINE);
	if (end === -1) return undefined;
	try {
		const header: unknown = JSON.parse(new TextDecoder().decode(envelope.subarray(0, end)));
		const dsn = (header as { dsn?: unknown } | null)?.dsn;
		return typeof dsn === 'string' ? dsn : undefined;
	} catch {
		return undefined;
	}
}

export function sentryRelay({
	dsn,
	logger,
	timeoutMs = 5_000,
	fetch = globalThis.fetch
}: SentryRelayOptions): ErrorRelay {
	const log = logger.child({ component: 'error-relay' });
	const ours = parseDsn(dsn);
	if (!ours) throw new Error('SENTRY_DSN is not a Sentry DSN');

	return {
		enabled: true,
		async relay(envelope): Promise<ErrorRelayOutcome> {
			const theirs = envelopeDsn(envelope);
			if (!theirs || parseDsn(theirs)?.identity !== ours.identity) {
				// The DSN isn't logged: whatever the sender put there.
				log.warn('error report refused', { reason: theirs ? 'other project' : 'not an envelope' });
				return { kind: 'refused' };
			}
			try {
				const response = await fetch(ours.ingestUrl, {
					method: 'POST',
					headers: { 'content-type': 'application/x-sentry-envelope' },
					body: envelope,
					signal: AbortSignal.timeout(timeoutMs),
					redirect: 'error'
				});
				await response.body?.cancel();
				const headers: Record<string, string> = {};
				for (const name of BACK_OFF_HEADERS) {
					const value = response.headers.get(name);
					if (value) headers[name] = value;
				}
				if (!response.ok) log.warn('error report not accepted', { status: response.status });
				return { kind: 'sent', status: response.status, headers };
			} catch (err) {
				log.warn('error report not sent', {
					reason: err instanceof Error ? err.name : 'unknown'
				});
				return { kind: 'failed' };
			}
		}
	};
}

/** Error reporting off: the route answers 404. */
export const noErrorRelay: ErrorRelay = {
	enabled: false,
	relay: async () => ({ kind: 'refused' })
};
