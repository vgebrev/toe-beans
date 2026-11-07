// Every expected failure a use case can return. The http layer maps each kind to a problem type
// and status (http/problem.ts); anything thrown instead is a bug and becomes a 500.
import type { DomainError } from '../domain/errors.js';

export type { ConflictError, DomainError, ValidationError } from '../domain/errors.js';
export { conflictError, validationError } from '../domain/errors.js';

/** No session, or it expired. */
export interface UnauthenticatedError {
	kind: 'unauthenticated';
}

/** Signed in and in the household, but the role can't do this (e.g. a caregiver revoking someone else's invite). */
export interface ForbiddenError {
	kind: 'forbidden';
}

/**
 * Missing, or in another household: the two look the same so IDs don't leak (architecture §4.4).
 * `resource` is for logs and the problem title, never an ID.
 */
export interface NotFoundError {
	kind: 'not-found';
	resource: string;
}

/** The write carried a version that's no longer current: someone else saved first (NFR-13). */
export interface StaleVersionError {
	kind: 'stale-version';
}

/** A mutation of a versioned resource arrived without If-Match (architecture §3.3). */
export interface PreconditionRequiredError {
	kind: 'precondition-required';
}

/** Too many attempts from this caller; they can try again later. */
export interface RateLimitedError {
	kind: 'rate-limited';
}

/** Something outside the app, such as the email provider, didn't work. Trying again may. */
export interface UnavailableError {
	kind: 'unavailable';
	message: string;
}

export type AppError =
	| DomainError
	| UnauthenticatedError
	| ForbiddenError
	| NotFoundError
	| StaleVersionError
	| PreconditionRequiredError
	| RateLimitedError
	| UnavailableError;

export const unauthenticated: UnauthenticatedError = { kind: 'unauthenticated' };
export const forbidden: ForbiddenError = { kind: 'forbidden' };
export const notFound = (resource: string): NotFoundError => ({ kind: 'not-found', resource });
export const staleVersion: StaleVersionError = { kind: 'stale-version' };
export const preconditionRequired: PreconditionRequiredError = { kind: 'precondition-required' };
export const rateLimited: RateLimitedError = { kind: 'rate-limited' };
export const unavailable = (message: string): UnavailableError => ({
	kind: 'unavailable',
	message
});
