// How a form's save turned out (ui.md §5.2), and how a failed one reads: signed out, field
// messages from a 400, or a failure the form offers to retry. A conflict and a missing item are
// worded by each caller, which knows what was being saved.
import type { ApiError } from '#lib/api-client/index.js';

export type SaveOutcome<F extends string> =
	| { kind: 'saved' }
	| { kind: 'invalid'; fields: Partial<Record<F, string>>; message?: string }
	| { kind: 'failed' }
	| { kind: 'signed-out' }
	/** Changed elsewhere: the form offers to load the latest. */
	| { kind: 'conflict'; message: string }
	/** Gone elsewhere: nothing to save into. */
	| { kind: 'gone'; message: string };

/**
 * A failed save, for anything but a conflict or a missing item. `fieldOf` names the form's field
 * for an API error key; a 400 with none the form shows reads as its detail instead.
 */
export function saveOutcomeOf<F extends string>(
	error: ApiError,
	fieldOf: (key: string) => F | undefined
): SaveOutcome<F> {
	if (error.kind !== 'problem') return { kind: 'failed' };
	const { status, errors, detail, title } = error.problem;
	if (status === 401) return { kind: 'signed-out' };
	if (status === 400) {
		const fields: Partial<Record<F, string>> = {};
		for (const [key, messages] of Object.entries(errors ?? {})) {
			const name = fieldOf(key);
			if (name && messages[0]) fields[name] = messages[0];
		}
		return Object.keys(fields).length > 0
			? { kind: 'invalid', fields }
			: { kind: 'invalid', fields: {}, message: detail ?? title };
	}
	return { kind: 'failed' };
}
