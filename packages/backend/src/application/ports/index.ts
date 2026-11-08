// The ports use cases depend on. Infrastructure implements them; composition.ts wires them in.
import type { IdGenerator } from '../../domain/id.js';
import type {
	PendingSignInRepository,
	SessionRepository,
	UserRepository
} from './auth-repositories.js';
import type { Clock } from './clock.js';
import type { DogRepository, PhotoProcessor, PhotoStore } from './dog-ports.js';
import type { EmailSender } from './email-sender.js';
import type { ErrorReporter } from './error-reporter.js';
import type { HouseholdRepository, InvitationRepository } from './household-repositories.js';
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
export type {
	DogChanges,
	DogRepository,
	NewDog,
	PhotoProcessor,
	PhotoStore,
	ProcessedPhoto,
	StoredPhoto
} from './dog-ports.js';
export type { EmailFailure, EmailMessage, EmailSender } from './email-sender.js';
export type { ErrorReporter } from './error-reporter.js';
export type {
	HouseholdRepository,
	InvitationRepository,
	NewInvitation
} from './household-repositories.js';
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
	households: HouseholdRepository;
	invitations: InvitationRepository;
	email: EmailSender;
	/** Looking at or accepting an invitation, per client address (architecture §7). */
	inviteRateLimit: RateLimiter;
	/** Invitations sent by email, per household, so one can't be used to mail people at will. */
	inviteEmailRateLimit: RateLimiter;
	dogs: DogRepository;
	photos: PhotoStore;
	photoProcessor: PhotoProcessor;
}
