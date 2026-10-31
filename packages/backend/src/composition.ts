// Composition root: wires infrastructure adapters into use cases (architecture §4.1). Later slices
// add repositories, the push sender and the worker to `ports`.
import type { Ports } from './application/ports/index.js';
import type { Config } from './config.js';
import { createIdGenerator } from './domain/id.js';
import { createHttp, type Http } from './http/index.js';
import { systemClock } from './infrastructure/system-clock.js';

export interface Backend {
	config: Config;
	http: Http;
}

/** `overrides` replaces adapters in tests, e.g. a manual clock. */
export function createBackend(config: Config, overrides: Partial<Ports> = {}): Backend {
	const clock = overrides.clock ?? systemClock;
	const ports: Ports = {
		clock,
		ids: overrides.ids ?? createIdGenerator(() => clock.now().getTime())
	};
	return { config, http: createHttp(ports) };
}
