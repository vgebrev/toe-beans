// The ports use cases depend on. Infrastructure implements them; composition.ts wires them in.
import type { IdGenerator } from '../../domain/id.js';
import type { Clock } from './clock.js';
import type { UnitOfWork } from './unit-of-work.js';

export type { Clock } from './clock.js';
export type { IdGenerator } from '../../domain/id.js';
export type { UnitOfWork } from './unit-of-work.js';

export interface Ports {
	clock: Clock;
	ids: IdGenerator;
	uow: UnitOfWork;
}
