// What the session form edits, and how a save turned out (ui.md J3, §5.2).
import type { ApiError } from '#lib/api-client/index.js';
import { EVERY_DAY, WEEKDAYS } from './dates.js';

export type RepeatChoice = 'never' | 'daily' | 'weekdays' | 'custom';

export interface SessionValues {
	dogId: string;
	exerciseId: string | null;
	date: string;
	time: string;
	repeat: RepeatChoice;
	/** For `custom`. */
	days: number[];
	/** Empty for no end. */
	until: string;
}

export type FieldName = 'dogId' | 'exerciseId' | 'date' | 'time' | 'days' | 'until';

export type SaveOutcome =
	| { kind: 'saved' }
	| { kind: 'invalid'; fields: Partial<Record<FieldName, string>>; message?: string }
	| { kind: 'failed' }
	| { kind: 'signed-out' }
	/** Changed elsewhere: the form offers to load the latest. */
	| { kind: 'conflict'; message: string }
	/** Gone elsewhere: nothing to save into. */
	| { kind: 'gone'; message: string };

/** The repeat choice for a series' days. */
export function repeatChoice(days: readonly number[]): RepeatChoice {
	const key = days.join();
	if (key === EVERY_DAY.join()) return 'daily';
	if (key === WEEKDAYS.join()) return 'weekdays';
	return 'custom';
}

/** The days a choice means. */
export function repeatDays(values: Pick<SessionValues, 'repeat' | 'days'>): number[] {
	if (values.repeat === 'daily') return EVERY_DAY;
	if (values.repeat === 'weekdays') return WEEKDAYS;
	return [...values.days].sort((a, b) => a - b);
}

/** The API's repeat for the values, or null for once. */
export const repeatBody = (values: SessionValues) =>
	values.repeat === 'never'
		? null
		: { days: repeatDays(values), ...(values.until && { until: values.until }) };

/** Missing or impossible input, said before anything is sent (ui.md §5.1). */
export function checkValues(
	values: SessionValues,
	today: string
): Partial<Record<FieldName, string>> {
	const errors: Partial<Record<FieldName, string>> = {};
	if (!values.dogId) errors.dogId = 'Choose a dog.';
	if (!values.exerciseId) errors.exerciseId = 'Choose an exercise.';
	if (!values.date) errors.date = 'Choose a date.';
	else if (values.date < today) errors.date = 'Choose today or a later date.';
	if (!values.time) errors.time = 'Choose a time.';
	if (values.repeat === 'custom' && values.days.length === 0)
		errors.days = 'Choose at least one day.';
	if (values.repeat !== 'never' && values.until && values.date && values.until < values.date) {
		errors.until = 'End on or after the first date.';
	}
	return errors;
}

const FIELD_KEYS: Record<string, FieldName> = {
	dogId: 'dogId',
	exerciseId: 'exerciseId',
	date: 'date',
	time: 'time',
	'repeat.days': 'days',
	'repeat.until': 'until'
};

/** How a failed save reads, for anything but a conflict or a missing item, which callers word. */
export function outcomeOf(error: ApiError): SaveOutcome {
	if (error.kind !== 'problem') return { kind: 'failed' };
	const { status, errors, detail, title } = error.problem;
	if (status === 401) return { kind: 'signed-out' };
	if (status === 400) {
		const fields: Partial<Record<FieldName, string>> = {};
		for (const [key, messages] of Object.entries(errors ?? {})) {
			const name = FIELD_KEYS[key];
			if (name && messages[0]) fields[name] = messages[0];
		}
		return Object.keys(fields).length > 0
			? { kind: 'invalid', fields }
			: { kind: 'invalid', fields: {}, message: detail ?? title };
	}
	return { kind: 'failed' };
}
