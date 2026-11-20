// The ports use cases depend on. Infrastructure implements them; composition.ts wires them in.
import type { IdGenerator } from '../../domain/id.js';
import type {
	PendingSignInRepository,
	SessionRepository,
	UserRepository
} from './auth-repositories.js';
import type { BehaviourEventRepository } from './behaviour-event-repository.js';
import type { CareTaskRepository } from './care-task-repository.js';
import type { Clock } from './clock.js';
import type { CueRepository } from './cue-repository.js';
import type { DogRepository, PhotoProcessor, PhotoStore } from './dog-ports.js';
import type { EmailSender } from './email-sender.js';
import type { ErrorRelay, ErrorReporter } from './error-reporter.js';
import type { ExerciseCatalogue } from './exercise-catalogue.js';
import type {
	HouseholdData,
	HouseholdRepository,
	InvitationRepository
} from './household-repositories.js';
import type { IdentityAccounts } from './identity-accounts.js';
import type { IdentityProvider } from './identity-provider.js';
import type { Logger } from './logger.js';
import type { PlannedSessionRepository, TrainingPlanRepository } from './planner-repositories.js';
import type { RateLimiter } from './rate-limiter.js';
import type {
	PushDeviceRepository,
	PushSender,
	ReminderPreferenceRepository,
	ReminderRepository
} from './reminder-ports.js';
import type { Readiness } from './readiness.js';
import type { SessionLogRepository } from './session-log-repository.js';
import type { UnitOfWork } from './unit-of-work.js';

export type {
	PendingSignIn,
	PendingSignInRepository,
	Session,
	SessionRepository,
	SignInProfile,
	UserRepository
} from './auth-repositories.js';
export type {
	BehaviourEventChanges,
	BehaviourEventRepository,
	NewBehaviourEvent
} from './behaviour-event-repository.js';
export type {
	CareTaskChanges,
	CareTaskRepository,
	CareTimelineQuery,
	NewCareTask
} from './care-task-repository.js';
export type { Clock } from './clock.js';
export type { CueChanges, CueRepository, NewCue } from './cue-repository.js';
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
export type { ErrorRelay, ErrorRelayOutcome, ErrorReporter } from './error-reporter.js';
export type { ExerciseCatalogue } from './exercise-catalogue.js';
export type {
	HouseholdData,
	HouseholdRepository,
	InvitationRepository,
	NewInvitation
} from './household-repositories.js';
export type { IdentityAccounts } from './identity-accounts.js';
export type { IdGenerator } from '../../domain/id.js';
export type {
	IdentityClaims,
	IdentityFailure,
	IdentityProvider,
	SignInChecks
} from './identity-provider.js';
export type { LogFields, Logger } from './logger.js';
export type {
	NewPlannedSession,
	NewTrainingPlan,
	PlannedSessionChanges,
	PlannedSessionRepository,
	TrainingPlanChanges,
	TrainingPlanRepository
} from './planner-repositories.js';
export type { RateLimitDecision, RateLimiter } from './rate-limiter.js';
export type {
	NewPushDevice,
	NewReminder,
	PushDeviceRepository,
	PushOptions,
	PushOutcome,
	PushSender,
	ReminderOutcome,
	ReminderPreferenceRepository,
	ReminderRepository
} from './reminder-ports.js';
export type { Readiness } from './readiness.js';
export type {
	NewSessionLog,
	SessionLogChanges,
	SessionLogRepository
} from './session-log-repository.js';
export type { TimelineCursor, TimelineQuery } from './timeline.js';
export type { UnitOfWork } from './unit-of-work.js';

export interface Ports {
	clock: Clock;
	ids: IdGenerator;
	uow: UnitOfWork;
	logger: Logger;
	errors: ErrorReporter;
	/** The browser's error reports, sent on from the server (architecture D41). */
	errorRelay: ErrorRelay;
	/** Browser error reports, per client address (architecture D41). */
	errorReportRateLimit: RateLimiter;
	readiness: Readiness;
	identity: IdentityProvider;
	/** Deleting the person's accounts at the provider, with their own (S16.5). */
	identityAccounts: IdentityAccounts;
	users: UserRepository;
	sessions: SessionRepository;
	pendingSignIns: PendingSignInRepository;
	/** Sign-in and its callback, per client address (architecture §7). */
	authRateLimit: RateLimiter;
	households: HouseholdRepository;
	/** Deleting a household's records, whatever collection they're in (D38). */
	householdData: HouseholdData;
	invitations: InvitationRepository;
	email: EmailSender;
	/** Looking at or accepting an invitation, per client address (architecture §7). */
	inviteRateLimit: RateLimiter;
	/** API writes, per signed-in person (architecture D32). */
	writeRateLimit: RateLimiter;
	/** Dog photo uploads, per person (architecture D32). */
	photoRateLimit: RateLimiter;
	dogs: DogRepository;
	photos: PhotoStore;
	photoProcessor: PhotoProcessor;
	/** The curated library from `content/exercises/` (architecture §3.8). */
	exercises: ExerciseCatalogue;
	/** The shared cue dictionary (FR-04). */
	cues: CueRepository;
	/** Recurring series of planned sessions (FR-05). */
	plans: TrainingPlanRepository;
	/** Planned sessions, one-off or from a series (FR-05). */
	plannedSessions: PlannedSessionRepository;
	/** Practised sessions, planned or not (FR-07). */
	sessionLogs: SessionLogRepository;
	/** Notable moments with a dog, outside training (FR-08). */
	behaviourEvents: BehaviourEventRepository;
	/** Dog-specific care tasks: vaccinations, vet visits and the like (FR-10). */
	careTasks: CareTaskRepository;
	/** Browsers people turned reminders on in (FR-12). */
	pushDevices: PushDeviceRepository;
	/** What each person wants reminding of. */
	reminderPreferences: ReminderPreferenceRepository;
	/** The send ledger: one entry per reminder per person (D27). */
	reminders: ReminderRepository;
	/** Web Push (VAPID). */
	push: PushSender;
}
