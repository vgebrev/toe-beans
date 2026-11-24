// Framework-neutral handlers: (ctx, input) → HttpResponse. Slices add one group per resource,
// built from the use cases over `ports`.
import { createAccount } from '../application/account/account.js';
import { createAuth } from '../application/auth/auth.js';
import { createCues } from '../application/cues/cues.js';
import { createDogs } from '../application/dogs/dogs.js';
import { createExercises } from '../application/exercises/exercises.js';
import { createBehaviourEvents } from '../application/journal/behaviour-events.js';
import { createCareTasks } from '../application/care/care-tasks.js';
import { createHistory } from '../application/history/history.js';
import { createHouseholds } from '../application/household/household.js';
import { createInvitations } from '../application/household/invitations.js';
import { createPlanner } from '../application/planner/planner.js';
import type { Ports } from '../application/ports/index.js';
import type { ReminderTick, TickAuthenticator } from '../application/ports/tick.js';
import { createReminderSettings } from '../application/reminders/reminders.js';
import { createToday } from '../application/today/today.js';
import { createSessionLogs } from '../application/training-log/session-logs.js';
import { createAccountHttp, type AccountHttp } from './account.js';
import { createBehaviourEventsHttp, type BehaviourEventsHttp } from './behaviour-events.js';
import { CALLBACK_PATH, createAuthHttp, type AuthHttp } from './auth.js';
import { createCareTasksHttp, type CareTasksHttp } from './care-tasks.js';
import { createCuesHttp, type CuesHttp } from './cues.js';
import { createDogsHttp, type DogsHttp } from './dogs.js';
import { createEdgeHttp, type EdgeHttp } from './edge.js';
import { createErrorRelayHttp, type ErrorRelayHttp } from './error-relay.js';
import { createExercisesHttp, type ExercisesHttp } from './exercises.js';
import { createHealthHttp, type HealthHttp } from './health.js';
import { createHistoryHttp, type HistoryHttp } from './history.js';
import { createHouseholdHttp, type HouseholdHttp } from './household.js';
import { createPlannerHttp, type PlannerHttp } from './planner.js';
import { createRemindersHttp, type RemindersHttp } from './reminders.js';
import { createSessionLogsHttp, type SessionLogsHttp } from './session-logs.js';
import { createTodayHttp, type TodayHttp } from './today.js';
import { createWorkerHttp, type WorkerHttp } from './tick.js';

export interface Http {
	/** Checks before any route, and the headers on every response (architecture §7). */
	edge: EdgeHttp;
	health: HealthHttp;
	/** The browser's error reports, sent on to error tracking (architecture D41). */
	errorRelay: ErrorRelayHttp;
	auth: AuthHttp;
	account: AccountHttp;
	household: HouseholdHttp;
	dogs: DogsHttp;
	exercises: ExercisesHttp;
	cues: CuesHttp;
	planner: PlannerHttp;
	sessionLogs: SessionLogsHttp;
	behaviourEvents: BehaviourEventsHttp;
	careTasks: CareTasksHttp;
	today: TodayHttp;
	history: HistoryHttp;
	reminders: RemindersHttp;
	worker: WorkerHttp;
}

export interface HttpOptions {
	/** The origin users reach the app on, e.g. `https://toebeans.co.za`. */
	publicOrigin: string;
	/** The proxy's header secret; unset takes requests from anyone. */
	proxySecret?: string;
	/** Push services devices may subscribe with. */
	allowedPushEndpoints: readonly string[];
	/** The reminder tick, and who may run it over HTTP (architecture §6.3). */
	worker: ReminderTick;
	tickAuth: TickAuthenticator;
}

export function createHttp(
	ports: Ports,
	{ publicOrigin, proxySecret, allowedPushEndpoints, worker, tickAuth }: HttpOptions
): Http {
	const auth = createAuth(ports, {
		callbackUri: publicOrigin + CALLBACK_PATH,
		postSignOutUri: publicOrigin + '/'
	});
	const planner = createPlanner(ports);
	const sessionLogs = createSessionLogs(ports);
	const behaviourEvents = createBehaviourEvents(ports);
	const careTasks = createCareTasks(ports);
	return {
		edge: createEdgeHttp({
			publicOrigin,
			...(proxySecret && { proxySecret }),
			writeRateLimit: ports.writeRateLimit,
			logger: ports.logger
		}),
		health: createHealthHttp(ports),
		errorRelay: createErrorRelayHttp({
			relay: ports.errorRelay,
			rateLimit: ports.errorReportRateLimit,
			logger: ports.logger
		}),
		auth: createAuthHttp(auth, {
			publicOrigin,
			rateLimit: ports.authRateLimit,
			logger: ports.logger
		}),
		account: createAccountHttp(createAccount(ports)),
		household: createHouseholdHttp(
			createHouseholds(ports),
			createInvitations(ports, { publicOrigin }),
			{ rateLimit: ports.inviteRateLimit, logger: ports.logger }
		),
		dogs: createDogsHttp(createDogs(ports, planner)),
		exercises: createExercisesHttp(createExercises(ports)),
		cues: createCuesHttp(createCues(ports)),
		planner: createPlannerHttp(planner),
		sessionLogs: createSessionLogsHttp(sessionLogs),
		behaviourEvents: createBehaviourEventsHttp(behaviourEvents),
		careTasks: createCareTasksHttp(careTasks, ports.clock),
		today: createTodayHttp(createToday(ports, { planner, sessionLogs, careTasks })),
		history: createHistoryHttp(
			createHistory(ports, { sessionLogs, behaviourEvents, careTasks }),
			ports.clock
		),
		reminders: createRemindersHttp(
			createReminderSettings(ports, { allowedEndpoints: allowedPushEndpoints })
		),
		worker: createWorkerHttp(worker, { auth: tickAuth, logger: ports.logger })
	};
}

export type { AuthContext, Viewer } from '../application/auth/auth.js';
export {
	needsTerms,
	safeReturnTo,
	signInPath,
	type CookieReader,
	type SignInError
} from './auth.js';
export type { DogForm } from './dogs.js';
export * from './response.js';
export { PROXY_SECRET_HEADER } from './edge.js';
export { toProblem } from './problem.js';
export { REQUEST_ID_HEADER, requestIdFrom } from './request-id.js';
export { parseInput } from './validation.js';
