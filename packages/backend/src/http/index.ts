// Framework-neutral handlers: (ctx, input) → HttpResponse. Slices add one group per resource,
// built from the use cases over `ports`.
import { createAccount } from '../application/account/account.js';
import { createAuth } from '../application/auth/auth.js';
import { createCues } from '../application/cues/cues.js';
import { createDogs } from '../application/dogs/dogs.js';
import { createExercises } from '../application/exercises/exercises.js';
import { createHouseholds } from '../application/household/household.js';
import { createInvitations } from '../application/household/invitations.js';
import { createPlanner } from '../application/planner/planner.js';
import type { Ports } from '../application/ports/index.js';
import { createSessionLogs } from '../application/training-log/session-logs.js';
import { createAccountHttp, type AccountHttp } from './account.js';
import { CALLBACK_PATH, createAuthHttp, type AuthHttp } from './auth.js';
import { createCuesHttp, type CuesHttp } from './cues.js';
import { createDogsHttp, type DogsHttp } from './dogs.js';
import { createExercisesHttp, type ExercisesHttp } from './exercises.js';
import { createHealthHttp, type HealthHttp } from './health.js';
import { createHouseholdHttp, type HouseholdHttp } from './household.js';
import { createPlannerHttp, type PlannerHttp } from './planner.js';
import { createSessionLogsHttp, type SessionLogsHttp } from './session-logs.js';

export interface Http {
	health: HealthHttp;
	auth: AuthHttp;
	account: AccountHttp;
	household: HouseholdHttp;
	dogs: DogsHttp;
	exercises: ExercisesHttp;
	cues: CuesHttp;
	planner: PlannerHttp;
	sessionLogs: SessionLogsHttp;
}

export interface HttpOptions {
	/** The origin users reach the app on, e.g. `https://toebeans.co.za`. */
	publicOrigin: string;
}

export function createHttp(ports: Ports, { publicOrigin }: HttpOptions): Http {
	const auth = createAuth(ports, {
		callbackUri: publicOrigin + CALLBACK_PATH,
		postSignOutUri: publicOrigin + '/'
	});
	const planner = createPlanner(ports);
	return {
		health: createHealthHttp(ports),
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
		sessionLogs: createSessionLogsHttp(createSessionLogs(ports))
	};
}

export type { AuthContext, Viewer } from '../application/auth/auth.js';
export { safeReturnTo, signInPath, type CookieReader, type SignInError } from './auth.js';
export type { DogForm } from './dogs.js';
export * from './response.js';
export { toProblem } from './problem.js';
export { REQUEST_ID_HEADER, requestIdFrom } from './request-id.js';
export { parseInput } from './validation.js';
