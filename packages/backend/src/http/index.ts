// Framework-neutral handlers: (ctx, input) → HttpResponse. Slices add one group per resource,
// built from the use cases over `ports`.
import { createAccount } from '../application/account/account.js';
import { createAuth } from '../application/auth/auth.js';
import type { Ports } from '../application/ports/index.js';
import { createAccountHttp, type AccountHttp } from './account.js';
import { CALLBACK_PATH, createAuthHttp, type AuthHttp } from './auth.js';
import { createHealthHttp, type HealthHttp } from './health.js';

export interface Http {
	health: HealthHttp;
	auth: AuthHttp;
	account: AccountHttp;
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
	return {
		health: createHealthHttp(ports),
		auth: createAuthHttp(auth, {
			publicOrigin,
			rateLimit: ports.authRateLimit,
			logger: ports.logger
		}),
		account: createAccountHttp(createAccount(ports))
	};
}

export type { AuthContext, Viewer } from '../application/auth/auth.js';
export { safeReturnTo, signInPath, type CookieReader, type SignInError } from './auth.js';
export * from './response.js';
export { toProblem } from './problem.js';
export { REQUEST_ID_HEADER, requestIdFrom } from './request-id.js';
export { parseInput } from './validation.js';
