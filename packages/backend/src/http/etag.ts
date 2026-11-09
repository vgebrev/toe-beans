// Versions as ETags, for optimistic concurrency (architecture §3.3, NFR-13): GET sends the
// aggregate's version, and a mutation must send it back in If-Match.
import {
	preconditionRequired,
	staleVersion,
	type PreconditionRequiredError,
	type StaleVersionError
} from '../application/errors.js';
import { err, ok, type Result } from '../domain/result.js';

export const etag = (version: number): string => `"${version}"`;

/**
 * The version an If-Match header names. Missing is a 428. Anything that can't be one of our
 * ETags (`*`, a list, a weak tag) can't match the current version either, so it's a 412.
 */
export function versionFromIfMatch(
	header: string | null
): Result<number, PreconditionRequiredError | StaleVersionError> {
	if (header === null || header.trim() === '') return err(preconditionRequired);
	const match = /^\s*"([1-9][0-9]{0,15})"\s*$/.exec(header);
	return match ? ok(Number(match[1])) : err(staleVersion);
}
