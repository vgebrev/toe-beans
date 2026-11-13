// What the care form edits, and how a save turned out (ui.md J6, §5.2).
import type { CareCategory, CareTask } from '@toe-beans/contracts';
import type { ApiError } from '#lib/api-client/index.js';
import { careLabels } from './labels.js';

export interface CareValues {
	dogId: string;
	category: CareCategory | null;
	title: string;
	dueDate: string;
	/** Empty for a task with no time. */
	dueTime: string;
	notes: string;
}

export type CareField = 'dogId' | 'category' | 'title' | 'dueDate' | 'dueTime' | 'notes';

export type CareSaveOutcome =
	| { kind: 'saved' }
	| { kind: 'invalid'; fields: Partial<Record<CareField, string>>; message?: string }
	| { kind: 'failed' }
	| { kind: 'signed-out' }
	/** Changed elsewhere: the form offers to load the latest. */
	| { kind: 'conflict'; message: string }
	/** Gone elsewhere: nothing to save into. */
	| { kind: 'gone'; message: string };

export const valuesOf = (task: CareTask): CareValues => ({
	dogId: task.dogId,
	category: task.category,
	title: task.title,
	dueDate: task.dueDate,
	dueTime: task.dueTime ?? '',
	notes: task.notes ?? ''
});

/** The title a category pre-fills; *Other* leaves it for the person. */
export const defaultTitle = (category: CareCategory | null) =>
	category ? careLabels[category].title : '';

/** Missing input, said before anything is sent (ui.md §5.1). */
export function checkCare(values: CareValues): Partial<Record<CareField, string>> {
	const errors: Partial<Record<CareField, string>> = {};
	if (!values.dogId) errors.dogId = 'Choose a dog.';
	if (!values.category) errors.category = 'Choose what kind of care it is.';
	if (values.category === 'other' && !values.title.trim()) errors.title = 'Say what it is.';
	if (!values.dueDate) errors.dueDate = 'Choose a date.';
	return errors;
}

/** The body for a new task, or the fields changed since `initial` for an edit. */
export function careBody(values: CareValues, initial?: CareValues): Record<string, unknown> {
	const body: Record<string, unknown> = {
		dogId: values.dogId,
		category: values.category,
		title: values.title.trim() || null,
		dueDate: values.dueDate,
		dueTime: values.dueTime || null,
		notes: values.notes.trim() || null
	};
	if (!initial) return body;
	const before = careBody(initial);
	return Object.fromEntries(Object.entries(body).filter(([key, value]) => value !== before[key]));
}

const FIELDS: readonly CareField[] = ['dogId', 'category', 'title', 'dueDate', 'dueTime', 'notes'];

/** How a failed save reads, for anything but a conflict or a missing task, which callers word. */
export function careOutcomeOf(error: ApiError): CareSaveOutcome {
	if (error.kind !== 'problem') return { kind: 'failed' };
	const { status, errors, detail, title } = error.problem;
	if (status === 401) return { kind: 'signed-out' };
	if (status === 400) {
		const fields: Partial<Record<CareField, string>> = {};
		for (const [key, messages] of Object.entries(errors ?? {})) {
			if ((FIELDS as readonly string[]).includes(key) && messages[0]) {
				fields[key as CareField] = messages[0];
			}
		}
		return Object.keys(fields).length > 0
			? { kind: 'invalid', fields }
			: { kind: 'invalid', fields: {}, message: detail ?? title };
	}
	return { kind: 'failed' };
}
