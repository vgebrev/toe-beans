// RFC 9457 problem details, shared by the API and the web client (architecture §3.3).
import { z } from 'zod';

export const problemTypes = [
	'toe-beans/validation',
	'toe-beans/unauthenticated',
	'toe-beans/forbidden',
	'toe-beans/not-found',
	'toe-beans/conflict',
	'toe-beans/precondition-required',
	'toe-beans/rate-limited',
	'toe-beans/unavailable',
	'toe-beans/internal'
] as const;

export const ProblemType = z.enum(problemTypes);
export type ProblemType = z.infer<typeof ProblemType>;

export const Problem = z.object({
	type: ProblemType,
	title: z.string(),
	status: z.number().int().min(400).max(599),
	detail: z.string().optional(),
	/** Field-level messages for validation problems, keyed by dotted path. */
	errors: z.record(z.string(), z.array(z.string())).optional()
});
export type Problem = z.infer<typeof Problem>;
