// Readiness for `/readyz` (architecture §8.1): the deploy, the uptime monitor and the browser's own
// checks that the server answers (D31). There's no `/healthz`: Cloud Run's front end keeps it.
import type { Ports } from '../application/ports/index.js';
import { json, type HttpResponse } from './response.js';

/**
 * One check of the database answers every call for this long, so a burst of calls is one ping
 * of Atlas, not one each (security audit R4). Short enough that the monitor sees an outage.
 */
export const READINESS_FRESH_MS = 5_000;

export interface HealthHttp {
	readiness(): Promise<HttpResponse>;
}

export function createHealthHttp({
	readiness,
	logger,
	clock
}: Pick<Ports, 'readiness' | 'logger' | 'clock'>): HealthHttp {
	let last: { at: number; answer: Promise<HttpResponse> } | null = null;

	async function check(): Promise<HttpResponse> {
		try {
			await readiness.check();
			return json({ status: 'ready' });
		} catch (err) {
			// The reason stays in the logs; the probe only needs the status.
			logger.warn('not ready', { err });
			return json({ status: 'unavailable' }, 503);
		}
	}

	return {
		readiness() {
			const now = clock.now().getTime();
			if (!last || now - last.at >= READINESS_FRESH_MS) last = { at: now, answer: check() };
			return last.answer;
		}
	};
}
