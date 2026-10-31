// Request shape is checked here with the contracts' Zod schemas; meaning is the domain's job
// (architecture §7). Both come back as a ValidationError.
import type { z } from 'zod';
import { validationError, type ValidationError } from '../application/errors.js';
import { err, ok, type Result } from '../domain/result.js';

export function parseInput<S extends z.ZodType>(
	schema: S,
	input: unknown
): Result<z.output<S>, ValidationError> {
	const parsed = schema.safeParse(input);
	if (parsed.success) return ok(parsed.data);

	const fields: Record<string, string[]> = {};
	for (const issue of parsed.error.issues) {
		// '' is the request body as a whole (e.g. it wasn't an object).
		const path = issue.path.map(String).join('.');
		(fields[path] ??= []).push(issue.message);
	}
	return err(validationError('The request is not valid.', fields));
}
