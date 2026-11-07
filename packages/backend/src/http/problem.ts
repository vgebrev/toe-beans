// AppError → RFC 9457 problem details (architecture §3.3). The UI keys on `type`, and shows
// `errors` inline for validation problems (ui.md §5.2).
import type { Problem } from '@toe-beans/contracts';
import type { AppError } from '../application/errors.js';

export function toProblem(error: AppError): Problem {
	switch (error.kind) {
		case 'validation':
			return {
				type: 'toe-beans/validation',
				title: 'Some details need fixing',
				status: 400,
				detail: error.message,
				...(error.fields && { errors: error.fields })
			};
		case 'unauthenticated':
			return { type: 'toe-beans/unauthenticated', title: 'Please sign in', status: 401 };
		case 'forbidden':
			return { type: 'toe-beans/forbidden', title: 'Your role cannot do this', status: 403 };
		case 'not-found':
			return {
				type: 'toe-beans/not-found',
				title: `${capitalise(error.resource)} not found`,
				status: 404
			};
		case 'conflict':
			return {
				type: 'toe-beans/conflict',
				title: 'This clashes with the current data',
				status: 409,
				detail: error.message
			};
		case 'stale-version':
			// Same type as a 409: either way the client reloads before retrying (ui.md §5.2).
			return { type: 'toe-beans/conflict', title: 'Someone else changed this', status: 412 };
		case 'precondition-required':
			return {
				type: 'toe-beans/precondition-required',
				title: 'If-Match is required',
				status: 428,
				detail: 'Send the ETag from the last read, so a newer change is not overwritten.'
			};
		case 'rate-limited':
			return {
				type: 'toe-beans/rate-limited',
				title: 'Too many attempts',
				status: 429,
				detail: 'Please wait a few minutes, then try again.'
			};
		case 'unavailable':
			return {
				type: 'toe-beans/unavailable',
				title: 'That did not work',
				status: 503,
				detail: error.message
			};
		default:
			return unreachable(error);
	}
}

/** For anything thrown rather than returned. Says nothing about the cause; the logs have it. */
export const internalProblem: Problem = {
	type: 'toe-beans/internal',
	title: 'Something went wrong on our side',
	status: 500
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function unreachable(error: never): never {
	throw new Error(`Unmapped error kind: ${(error as { kind: string }).kind}`);
}
