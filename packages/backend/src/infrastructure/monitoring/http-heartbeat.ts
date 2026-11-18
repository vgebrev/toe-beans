// The tick's heartbeat (backlog S14.4): a GET to the monitor's heartbeat URL (Better Stack, see
// docs/runbooks/monitoring.md). The URL holds the monitor's token, so it's never logged. A failed
// beat is only logged: the monitor's silence alert is what reports it.
import type { Logger } from '../../application/ports/logger.js';
import type { Heartbeat } from '../../application/ports/tick.js';

export interface HttpHeartbeatOptions {
	url: string;
	logger: Logger;
	/** Long enough for a slow answer, short enough not to hold the scheduler's request. */
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

export function httpHeartbeat({
	url,
	logger,
	timeoutMs = 5_000,
	fetch = globalThis.fetch
}: HttpHeartbeatOptions): Heartbeat {
	const log = logger.child({ component: 'heartbeat' });
	return {
		async beat() {
			try {
				const response = await fetch(url, {
					signal: AbortSignal.timeout(timeoutMs),
					redirect: 'error'
				});
				await response.body?.cancel();
				if (!response.ok) log.warn('heartbeat refused', { status: response.status });
			} catch (err) {
				log.warn('heartbeat failed', { reason: err instanceof Error ? err.name : 'unknown' });
			}
		}
	};
}

/** No monitor configured: local runs and tests. */
export const noHeartbeat: Heartbeat = { beat: async () => undefined };
