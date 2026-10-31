// Framework-neutral handlers: (ctx, input) → HttpResponse. Slices add one group per resource,
// built from the use cases over `ports`.
import type { Ports } from '../application/ports/index.js';

export type Http = Record<string, never>;

export function createHttp(_ports: Ports): Http {
	return {};
}

export * from './response.js';
export { toProblem } from './problem.js';
export { parseInput } from './validation.js';
