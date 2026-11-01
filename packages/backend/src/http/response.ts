// Framework-neutral responses. Handlers return these and the host (SvelteKit now, maybe Fastify
// later) turns them into its own response type, so no handler sees a framework object (NFR-15).
import type { Problem } from '@toe-beans/contracts';
import type { AppError } from '../application/errors.js';
import type { Result } from '../domain/result.js';
import { internalProblem, toProblem } from './problem.js';

export interface HttpResponse {
	status: number;
	headers: Record<string, string>;
	/** Serialised as JSON. Absent for 204 and redirects. */
	body?: unknown;
	/** Each becomes its own Set-Cookie header. */
	cookies?: SetCookie[];
}

/** A cookie to set, or to clear with `maxAge: 0`. Always `HttpOnly` and `Path=/`. */
export interface SetCookie {
	name: string;
	value: string;
	/** Seconds. */
	maxAge: number;
	secure: boolean;
	sameSite: 'lax' | 'strict';
}

/** The Set-Cookie header value. Values are base64url tokens, so nothing needs encoding. */
export const serializeCookie = (c: SetCookie): string =>
	[
		`${c.name}=${c.value}`,
		`Max-Age=${c.maxAge}`,
		'Path=/',
		'HttpOnly',
		...(c.secure ? ['Secure'] : []),
		`SameSite=${c.sameSite === 'lax' ? 'Lax' : 'Strict'}`
	].join('; ');

// API responses are personal data: never cached anywhere (architecture §7, NFR-04).
const noStore = { 'cache-control': 'no-store' };

export const json = (
	body: unknown,
	status = 200,
	headers: Record<string, string> = {}
): HttpResponse => ({
	status,
	headers: { 'content-type': 'application/json', ...noStore, ...headers },
	body
});

export const noContent = (headers: Record<string, string> = {}): HttpResponse => ({
	status: 204,
	headers: { ...noStore, ...headers }
});

/** 303 See Other: the browser follows with a GET, whatever the method was. */
export const redirect = (location: string, cookies: SetCookie[] = []): HttpResponse => ({
	status: 303,
	headers: { location, ...noStore },
	...(cookies.length > 0 && { cookies })
});

export const problem = (p: Problem): HttpResponse => ({
	status: p.status,
	headers: { 'content-type': 'application/problem+json', ...noStore },
	body: p
});

export const errorResponse = (error: AppError): HttpResponse => problem(toProblem(error));

export const internalError = (): HttpResponse => problem(internalProblem);

/** The usual handler tail: success goes through `onOk`, an expected error becomes a problem. */
export const respond = <T>(
	result: Result<T, AppError>,
	onOk: (value: T) => HttpResponse
): HttpResponse => (result.ok ? onOk(result.value) : errorResponse(result.error));
