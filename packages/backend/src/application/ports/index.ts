// The ports use cases depend on. Infrastructure implements them; composition.ts wires them in.
import type { IdGenerator } from '../../domain/id.js';
import type { Clock } from './clock.js';

export type { Clock } from './clock.js';
export type { IdGenerator } from '../../domain/id.js';

export interface Ports {
	clock: Clock;
	ids: IdGenerator;
}
