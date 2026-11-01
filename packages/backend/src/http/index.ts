// Framework-neutral handlers: (ctx, input) → HttpResponse. Slices add one group per resource,
// built from the use cases over `ports`.
import type { Ports } from '../application/ports/index.js';
import { createHealthHttp, type HealthHttp } from './health.js';

export interface Http {
	health: HealthHttp;
}

export function createHttp(ports: Ports): Http {
	return { health: createHealthHttp(ports) };
}

export * from './response.js';
export { toProblem } from './problem.js';
export { REQUEST_ID_HEADER, requestIdFrom } from './request-id.js';
export { parseInput } from './validation.js';
