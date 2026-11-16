// The care calendar (architecture §5.2, D30, FR-10): dog-specific tasks such as a vaccination, a
// parasite treatment or a vet visit, due on a date and perhaps at a time on the household's
// clocks. A task is upcoming until someone completes or cancels it, and its history keeps every
// change of status and date, so updating it never loses what happened (FR-10). Nothing here
// assumes a veterinary schedule (NFR-14): people choose every date.
import { addDays, isPlainDate, type PlainDate, type PlainTime } from './calendar.js';
import { validationError, type ValidationError } from './errors.js';
import type { Id } from './id.js';
import { cleanName, patchText } from './name.js';
import { timeProblem } from './planner.js';
import { err, ok, type Result } from './result.js';

export const CARE_CATEGORIES = [
	'vaccination',
	'parasite_prevention',
	'vet_appointment',
	'puppy_school',
	'sterilisation_consult',
	'other'
] as const;
export type CareCategory = (typeof CARE_CATEGORIES)[number];

/** The title a task gets when none is given, which the form also pre-fills (ui.md J6). */
export const CARE_CATEGORY_TITLES: Record<CareCategory, string> = {
	vaccination: 'Vaccination',
	parasite_prevention: 'Parasite prevention',
	vet_appointment: 'Vet appointment',
	puppy_school: 'Puppy school',
	sterilisation_consult: 'Sterilisation consult',
	other: 'Care task'
};

export type CareStatus = 'upcoming' | 'completed' | 'cancelled';

/** When a task is due: a date, and a time if it has one, on the household's clocks. */
export interface CareDue {
	date: PlainDate;
	time?: PlainTime;
}

/** One change in a task's life, append-only (FR-10: updated without losing history). */
export type CareChange =
	| { kind: 'created'; due: CareDue }
	| { kind: 'rescheduled'; from: CareDue; due: CareDue }
	| { kind: 'completed'; on: PlainDate }
	| { kind: 'cancelled' }
	/** Back to upcoming from completed or cancelled. */
	| { kind: 'reopened' };

export type CareHistoryEntry = CareChange & { at: Date; by: Id };

/** What a person says about a task, apart from the dog and its status. */
export interface CareDetails {
	category: CareCategory;
	title: string;
	dueDate: PlainDate;
	dueTime?: PlainTime;
	notes?: string;
}

export interface CareTask extends CareDetails {
	id: Id;
	householdId: Id;
	dogId: Id;
	status: CareStatus;
	/** The day it was done, on the household's clocks; asked for when marking it done. */
	completedOn?: PlainDate;
	/** The task planned on completing this one (ui.md J6, "Plan the next one"). */
	nextId?: Id;
	/** Oldest first. */
	history: CareHistoryEntry[];
	createdBy: Id;
	/** Who changed it last, for "Alex changed this a moment ago" (ui.md §5.2). */
	updatedBy: Id;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export const CARE_TITLE_MAX = 80;
export const CARE_NOTES_MAX = 2000;
/** A task can be recorded up to a year back, to complete one that was missed. */
export const CARE_BACK_DAYS = 366;
/** Two years ahead: an annual booster planned on completing this year's still fits. */
export const CARE_AHEAD_DAYS = 731;
/** Enough for years of changes; past this the oldest go, keeping the first. */
export const CARE_HISTORY_MAX = 100;

export const isCareCategory = (value: unknown): value is CareCategory =>
	CARE_CATEGORIES.includes(value as CareCategory);

export const dueOf = (task: Pick<CareDetails, 'dueDate' | 'dueTime'>): CareDue => ({
	date: task.dueDate,
	...(task.dueTime && { time: task.dueTime })
});

const sameDue = (a: CareDue, b: CareDue) => a.date === b.date && a.time === b.time;

/** What a person sends. In an update, a missing field stays as it was and null clears it. */
export interface CareDetailsInput {
	category?: string | undefined;
	title?: string | null | undefined;
	dueDate?: string | undefined;
	dueTime?: string | null | undefined;
	notes?: string | null | undefined;
}

/** A date within the limits, keyed by the input's name in the field errors. */
function checkDate(
	value: string,
	today: PlainDate,
	{ back, ahead }: { back: number; ahead: number }
): string | null {
	if (!isPlainDate(value)) return 'Choose a date.';
	if (value < addDays(today, -back)) return 'Choose a date within the last year.';
	if (value > addDays(today, ahead)) {
		return ahead === 0 ? "Choose today or a day that's passed." : 'Choose a date within two years.';
	}
	return null;
}

/**
 * Applies `input` over `base` (a new task's defaults, or the task being edited) and checks the
 * result against the household's `today`: a category, a title (the category's when left blank), a
 * date from a year back to two years ahead, a time in 5-minute steps if any, and notes. A new task
 * has no category or date until they're given.
 */
export function cleanCareDetails(
	input: CareDetailsInput,
	base: Partial<CareDetails>,
	today: PlainDate
): Result<CareDetails, ValidationError> {
	const fields: Record<string, string[]> = {};
	const next = { ...base };

	if (input.category !== undefined) {
		if (isCareCategory(input.category)) next.category = input.category;
		else fields.category = ['Choose what kind of care it is.'];
	} else if (!next.category) fields.category = ['Choose what kind of care it is.'];

	if (input.title !== undefined) {
		const title = input.title === null ? '' : input.title;
		if (title.trim() === '') delete next.title;
		else {
			const cleaned = cleanName(title, CARE_TITLE_MAX);
			if (cleaned === null) fields.title = [`Keep the title to ${CARE_TITLE_MAX} characters.`];
			else next.title = cleaned;
		}
	}
	if (!next.title && next.category) next.title = CARE_CATEGORY_TITLES[next.category];

	if (input.dueDate !== undefined) {
		const problem = checkDate(input.dueDate, today, {
			back: CARE_BACK_DAYS,
			ahead: CARE_AHEAD_DAYS
		});
		if (problem) fields.dueDate = [problem];
		else next.dueDate = input.dueDate as PlainDate;
	} else if (!next.dueDate) fields.dueDate = ['Choose a date.'];

	if (input.dueTime !== undefined) {
		if (input.dueTime === null || input.dueTime === '') delete next.dueTime;
		else {
			const problem = timeProblem(input.dueTime);
			if (problem) fields.dueTime = [problem];
			else next.dueTime = input.dueTime as PlainTime;
		}
	}

	patchText(next, fields, 'notes', input.notes, CARE_NOTES_MAX);

	if (Object.keys(fields).length > 0 || !next.category || !next.dueDate || !next.title) {
		return err(validationError('The care task is not valid.', fields));
	}
	return ok(next as CareDetails);
}

/** The day it was done: today or earlier, within the last year. Keyed `completedOn`. */
export function checkCompletedOn(
	value: string | undefined,
	today: PlainDate
): Result<PlainDate, ValidationError> {
	if (value === undefined) return ok(today);
	const problem = checkDate(value, today, { back: CARE_BACK_DAYS, ahead: 0 });
	return problem
		? err(validationError('The completion date is not valid.', { completedOn: [problem] }))
		: ok(value as PlainDate);
}

/** Appends `change`, keeping the first entry and the latest ones under the cap. */
export function withChange(history: readonly CareHistoryEntry[], change: CareHistoryEntry) {
	const all = [...history, change];
	return all.length <= CARE_HISTORY_MAX ? all : [all[0]!, ...all.slice(-(CARE_HISTORY_MAX - 1))];
}

/** The history entries an edit adds: a new date is a reschedule, a new status its change. */
export function changesFrom(
	before: Pick<CareTask, 'status' | 'dueDate' | 'dueTime'>,
	after: Pick<CareTask, 'status' | 'dueDate' | 'dueTime'>
): CareChange[] {
	const changes: CareChange[] = [];
	if (before.status !== after.status) {
		if (after.status === 'cancelled') changes.push({ kind: 'cancelled' });
		else if (after.status === 'upcoming') changes.push({ kind: 'reopened' });
	}
	if (!sameDue(dueOf(before), dueOf(after))) {
		changes.push({ kind: 'rescheduled', from: dueOf(before), due: dueOf(after) });
	}
	return changes;
}

/** Overdue: still upcoming on a day that's gone (a task due today is today's, whatever its time). */
export const isOverdue = (task: Pick<CareTask, 'status' | 'dueDate'>, today: PlainDate) =>
	task.status === 'upcoming' && task.dueDate < today;

/** How far ahead Today's *Coming up* looks (ui.md J6). */
export const COMING_UP_DAYS = 7;
