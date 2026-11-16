// What the session form edits, and how a save turned out (ui.md J3, §5.2).
import type { ApiError } from '#lib/api-client/index.js';
import { saveOutcomeOf, type SaveOutcome as FormSaveOutcome } from '#lib/forms/save-outcome.js';
import { EVERY_DAY, WEEKDAYS } from './dates.js';

export type RepeatChoice = 'never' | 'daily' | 'weekdays' | 'custom';

export interface SessionValues {
	dogId: string;
	exerciseId: string | null;
	date: string;
	/** The first is *Time*; the rest, *Also at*, only count with a repeat. */
	times: string[];
	repeat: RepeatChoice;
	/** For `custom`. */
	days: number[];
	/** Empty for no end. */
	until: string;
}

/** `time` is the first time, `time-1`… the others, `times` the list as a whole. */
export type FieldName =
	'dogId' | 'exerciseId' | 'date' | 'time' | `time-${number}` | 'times' | 'days' | 'until';

/** The field of the time at `index`. */
export const timeField = (index: number): FieldName => (index === 0 ? 'time' : `time-${index}`);

export type SaveOutcome = FormSaveOutcome<FieldName>;

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

/**
 * The API's times for the values: the first alone unless it repeats. In the form's order, so an
 * error the server keys `times.2` is the third row's; the server sorts them.
 */
export const timesBody = (values: SessionValues): string[] =>
	values.repeat === 'never' ? values.times.slice(0, 1) : [...values.times];

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
	if (!values.times[0]) errors.time = 'Choose a time.';
	if (values.repeat !== 'never') {
		values.times.forEach((time, i) => {
			if (i === 0 || !time) {
				if (i > 0) errors[timeField(i)] = 'Choose a time, or remove it.';
				return;
			}
			if (values.times.indexOf(time) < i) errors[timeField(i)] = 'That time is already in.';
		});
	}
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
	times: 'times',
	'repeat.days': 'days',
	'repeat.until': 'until'
};

/** The form's field for an API error key: `times.2` is the third time's. */
function fieldOf(key: string): FieldName | undefined {
	const index = /^times\.(\d+)$/.exec(key)?.[1];
	return index === undefined ? FIELD_KEYS[key] : timeField(Number(index));
}

/** How a failed save reads, for anything but a conflict or a missing item, which callers word. */
export const outcomeOf = (error: ApiError): SaveOutcome => saveOutcomeOf(error, fieldOf);
