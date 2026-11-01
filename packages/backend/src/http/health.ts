// Readiness for `/readyz` (architecture §8.1). Liveness (`/healthz`) needs no backend: the host
// answers it directly.
import type { Ports } from '../application/ports/index.js';
import { json, type HttpResponse } from './response.js';

export interface HealthHttp {
	readiness(): Promise<HttpResponse>;
}

export function createHealthHttp({
	readiness,
	logger
}: Pick<Ports, 'readiness' | 'logger'>): HealthHttp {
	return {
		async readiness() {
			try {
				await readiness.check();
				return json({ status: 'ready' });
			} catch (err) {
				// The reason stays in the logs; the probe only needs the status.
				logger.warn('not ready', { err });
				return json({ status: 'unavailable' }, 503);
			}
		}
	};
}
