// Composition root: wires infrastructure adapters into use cases (architecture §4.1). Later slices
// add repositories, the push sender and the worker to `ports`.
import type { ErrorReporter, Logger, Ports } from './application/ports/index.js';
import type { Config } from './config.js';
import { createPlanner } from './application/planner/planner.js';
import { createIdGenerator } from './domain/id.js';
import { createHttp, type Http } from './http/index.js';
import { oidcIdentityProvider } from './infrastructure/auth/oidc-provider.js';
import { tickAuthenticator } from './infrastructure/auth/tick-auth.js';
import {
	createSentryReporter,
	noopErrorReporter
} from './infrastructure/error-reporting/sentry.js';
import {
	findContentDirectory,
	loadExerciseCatalogue
} from './infrastructure/content/exercise-files.js';
import { createEmailSender } from './infrastructure/email/index.js';
import { createPhotoStore, sharpPhotoProcessor } from './infrastructure/photos/index.js';
import { createPinoLogger } from './infrastructure/logging/pino-logger.js';
import {
	mongoPendingSignIns,
	mongoSessions,
	mongoUsers
} from './infrastructure/persistence/auth-collections.js';
import { mongoCues } from './infrastructure/persistence/cue-collection.js';
import { mongoDogs } from './infrastructure/persistence/dog-collection.js';
import {
	mongoHouseholds,
	mongoInvitations
} from './infrastructure/persistence/household-collections.js';
import {
	mongoPlannedSessions,
	mongoTrainingPlans
} from './infrastructure/persistence/planner-collections.js';
import { mongoSessionLogs } from './infrastructure/persistence/session-log-collection.js';
import {
	mongoPushDevices,
	mongoReminderPreferences,
	mongoReminders
} from './infrastructure/persistence/reminder-collections.js';
import { generateVapidKeys, webPushSender } from './infrastructure/push/web-push-sender.js';
import { migrate, migrations } from './infrastructure/persistence/migrations/index.js';
import { connectMongo, mongoReadiness } from './infrastructure/persistence/mongo.js';
import { mongoUnitOfWork } from './infrastructure/persistence/unit-of-work.js';
import { memoryRateLimiter } from './infrastructure/rate-limit/memory-rate-limiter.js';
import { withRequestContext, type RequestContext } from './infrastructure/request-context.js';
import { systemClock } from './infrastructure/system-clock.js';
import { createWorker } from './worker/tick.js';
import type { ReminderTick } from './application/ports/tick.js';

export type { RequestContext } from './infrastructure/request-context.js';

export interface Backend {
	config: Config;
	http: Http;
	logger: Logger;
	errors: ErrorReporter;
	/** The reminder tick (architecture §6.3); also reachable over HTTP as `http.worker`. */
	worker: ReminderTick;
	/** Runs `work` with the request's ID on every log line and error report it causes. */
	withRequestContext<T>(context: RequestContext, work: () => T): T;
	/** Closes the database connection and flushes error reports; call once the server has stopped taking requests. */
	close(): Promise<void>;
}

/**
 * Connects to Mongo and applies pending migrations, so the host should await it before listening
 * (S-1.4). Rejects if either fails, after logging why. `overrides` replaces adapters in tests,
 * e.g. a manual clock.
 */
export async function createBackend(
	config: Config,
	overrides: Partial<Ports> = {}
): Promise<Backend> {
	const started = performance.now();
	const clock = overrides.clock ?? systemClock;
	const logger = overrides.logger ?? createPinoLogger({ level: config.logLevel });
	const errors =
		overrides.errors ??
		(config.sentry
			? createSentryReporter({
					dsn: config.sentry.dsn,
					environment: config.appEnv,
					release: config.release
				})
			: noopErrorReporter);

	// Before Mongo: a bad library is the cheaper failure to find (architecture §3.8).
	let exercises;
	try {
		exercises =
			overrides.exercises ??
			(await loadExerciseCatalogue(config.contentDir ?? findContentDirectory(), {
				strict: config.appEnv === 'prod',
				logger
			}));
	} catch (err) {
		logger.error('could not load the exercise library', { err });
		throw err;
	}

	let mongo;
	try {
		mongo = await connectMongo(config.mongodb.uri, config.mongodb.db);
	} catch (err) {
		logger.error('could not connect to MongoDB', { err });
		throw err;
	}
	try {
		await migrate(mongo.db, migrations, { clock });
	} catch (err) {
		logger.error('migrations failed', { err });
		await mongo.close();
		throw err;
	}

	const ports: Ports = {
		clock,
		ids: overrides.ids ?? createIdGenerator(() => clock.now().getTime()),
		uow: overrides.uow ?? mongoUnitOfWork(mongo.client),
		logger,
		errors,
		readiness: overrides.readiness ?? mongoReadiness(mongo.db),
		identity: overrides.identity ?? oidcIdentityProvider(config.oidc),
		users: overrides.users ?? mongoUsers(mongo.db),
		sessions: overrides.sessions ?? mongoSessions(mongo.db),
		pendingSignIns: overrides.pendingSignIns ?? mongoPendingSignIns(mongo.db),
		authRateLimit: overrides.authRateLimit ?? memoryRateLimiter({ ...config.authRateLimit, clock }),
		households: overrides.households ?? mongoHouseholds(mongo.db),
		invitations: overrides.invitations ?? mongoInvitations(mongo.db, clock),
		email: overrides.email ?? createEmailSender(config.email),
		inviteRateLimit:
			overrides.inviteRateLimit ?? memoryRateLimiter({ ...config.inviteRateLimit, clock }),
		inviteEmailRateLimit:
			overrides.inviteEmailRateLimit ??
			memoryRateLimiter({ limit: 10, windowMs: 60 * 60_000, clock }),
		dogs: overrides.dogs ?? mongoDogs(mongo.db, clock),
		photos: overrides.photos ?? createPhotoStore(config.photos),
		photoProcessor: overrides.photoProcessor ?? sharpPhotoProcessor(),
		exercises,
		cues: overrides.cues ?? mongoCues(mongo.db, clock),
		plans: overrides.plans ?? mongoTrainingPlans(mongo.db, clock),
		plannedSessions: overrides.plannedSessions ?? mongoPlannedSessions(mongo.db, clock),
		sessionLogs: overrides.sessionLogs ?? mongoSessionLogs(mongo.db, clock),
		pushDevices: overrides.pushDevices ?? mongoPushDevices(mongo.db, clock),
		reminderPreferences: overrides.reminderPreferences ?? mongoReminderPreferences(mongo.db),
		reminders: overrides.reminders ?? mongoReminders(mongo.db, clock),
		push: overrides.push ?? webPushSender({ vapid: vapidKeys(config, logger) })
	};
	const worker = createWorker(ports, createPlanner(ports), {
		intervalMs: config.worker.intervalMs
	});
	// Always-on hosts tick themselves (architecture §6.3). The first tick waits a full interval, so
	// a crash-looping server doesn't send on every start.
	const loop =
		config.worker.mode === 'inline'
			? setInterval(() => void worker.tick().catch(() => undefined), config.worker.intervalMs)
			: undefined;
	loop?.unref();
	logger.info('backend started', {
		appEnv: config.appEnv,
		release: config.release,
		errorReporting: Boolean(config.sentry),
		emailSender: config.email.kind,
		photoStore: config.photos.kind,
		workerMode: config.worker.mode,
		tickIntervalMin: config.worker.intervalMs / 60_000,
		exercises: exercises.all().length,
		publicOrigin: config.publicOrigin,
		oidcIssuer: config.oidc.issuer,
		durationMs: Math.round(performance.now() - started)
	});
	const db = mongo;
	return {
		config,
		http: createHttp(ports, {
			publicOrigin: config.publicOrigin,
			allowedPushEndpoints: config.push.allowedEndpoints,
			worker,
			tickAuth: tickAuthenticator(config.worker.auth)
		}),
		worker,
		logger,
		errors,
		withRequestContext,
		async close() {
			clearInterval(loop);
			await db.close();
			await errors.flush();
			logger.info('backend stopped');
		}
	};
}

/**
 * The configured VAPID pair. Off prod a run without one gets a fresh pair and a warning: devices
 * subscribed in an earlier run then stop getting reminders until their settings screen opens and
 * subscribes them again. `pnpm vapid` writes a lasting pair to .env.
 */
function vapidKeys(config: Config, logger: Logger) {
	if (config.push.vapid) return { ...config.push.vapid, subject: config.push.subject };
	logger.warn('no VAPID keys configured: using a pair for this run only (pnpm vapid)');
	return { ...generateVapidKeys(), subject: config.push.subject };
}
