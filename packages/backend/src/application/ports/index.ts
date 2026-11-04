// The ports use cases depend on. Infrastructure implements them; composition.ts wires them in.
import type { IdGenerator } from '../../domain/id.js';
import type {
	PendingSignInRepository,
	SessionRepository,
	UserRepository
} from './auth-repositories.js';
import type { Clock } from './clock.js';
import type { ErrorReporter } from './error-reporter.js';
import type { IdentityProvider } from './identity-provider.js';
import type { Logger } from './logger.js';
import type { RateLimiter } from './rate-limiter.js';
import type { Readiness } from './readiness.js';
import type { UnitOfWork } from './unit-of-work.js';

export type {
	PendingSignIn,
	PendingSignInRepository,
	Session,
	SessionRepository,
	SignInProfile,
	UserRepository
} from './auth-repositories.js';
export type { Clock } from './clock.js';
export type { ErrorReporter } from './error-reporter.js';
export type { IdGenerator } from '../../domain/id.js';
export type {
	IdentityClaims,
	IdentityFailure,
	IdentityProvider,
	SignInChecks
} from './identity-provider.js';
export type { LogFields, Logger } from './logger.js';
export type { RateLimitDecision, RateLimiter } from './rate-limiter.js';
export type { Readiness } from './readiness.js';
export type { UnitOfWork } from './unit-of-work.js';

export interface Ports {
	clock: Clock;
	ids: IdGenerator;
	uow: UnitOfWork;
	logger: Logger;
	errors: ErrorReporter;
	readiness: Readiness;
	identity: IdentityProvider;
	users: UserRepository;
	sessions: SessionRepository;
	pendingSignIns: PendingSignInRepository;
	/** Sign-in and its callback, per client address (architecture §7). */
	authRateLimit: RateLimiter;
}
