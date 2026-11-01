// The ports use cases depend on. Infrastructure implements them; composition.ts wires them in.
import type { IdGenerator } from '../../domain/id.js';
import type { Clock } from './clock.js';
import type { ErrorReporter } from './error-reporter.js';
import type { Logger } from './logger.js';
import type { Readiness } from './readiness.js';
import type { UnitOfWork } from './unit-of-work.js';

export type { Clock } from './clock.js';
export type { ErrorReporter } from './error-reporter.js';
export type { IdGenerator } from '../../domain/id.js';
export type { LogFields, Logger } from './logger.js';
export type { Readiness } from './readiness.js';
export type { UnitOfWork } from './unit-of-work.js';

export interface Ports {
	clock: Clock;
	ids: IdGenerator;
	uow: UnitOfWork;
	logger: Logger;
	errors: ErrorReporter;
	readiness: Readiness;
}
