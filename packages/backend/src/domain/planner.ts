// The training planner (architecture §5.2, FR-05): sessions planned for one dog at a date and
// time, once or on a weekly pattern. A recurring plan is a series that materialises its sessions
// over a rolling horizon, so each one can then be moved, skipped or cancelled on its own.
import {
	addDays,
	daysBetween,
	isPlainDate,
	isPlainTime,
	maxDate,
	minDate,
	weekday,
	type PlainDate,
	type PlainTime,
	type Weekday
} from './calendar.js';
import type { Id } from './id.js';

export type SessionStatus = 'planned' | 'completed' | 'skipped' | 'cancelled';

/**
 * The repeat rule, a subset of RFC 5545's (`FREQ=WEEKLY;BYDAY=…;UNTIL=…`, architecture D24):
 * the weekdays it falls on, every week, until an optional last date. Daily is all seven.
 */
export interface Repeat {
	/** Ascending, no duplicates, at least one. */
	days: Weekday[];
	/** The last date it can fall on, inclusive. */
	until?: PlainDate;
}

/** A recurring series (architecture §5.2 TrainingPlan). */
export interface TrainingPlan {
	id: Id;
	householdId: Id;
	dogId: Id;
	exerciseId: string;
	/** The first date it can fall on. */
	startDate: PlainDate;
	/** On the household's clocks. */
	time: PlainTime;
	days: Weekday[];
	until?: PlainDate;
	/** Set while its dog is archived: no new sessions until the dog is back (D24). */
	paused?: true;
	/**
	 * Sessions exist for every date up to and including this one. Starts the day before
	 * `startDate`, and only moves forward. Not an edit, so it doesn't change the version.
	 */
	horizon: PlainDate;
	updatedBy: Id;
	/** Starts at 1 and goes up by one on every write; the ETag (architecture §3.3). */
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

/** One planned session (architecture §5.2 PlannedSession). */
export interface PlannedSession {
	id: Id;
	householdId: Id;
	dogId: Id;
	exerciseId: string;
	/** UTC, from the date and time on the household's clocks. */
	scheduledAt: Date;
	status: SessionStatus;
	/** The series it came from, and the date it fell on there (even if since moved). */
	planId?: Id;
	occurrenceKey?: PlainDate;
	/** Set by the quick log (S7). */
	sessionLogId?: Id;
	/** Cancelled by archiving its dog, so bringing the dog back plans it again (D24). */
	cancelledWithDog?: true;
	/** Who changed it last, for "Alex changed this a moment ago" (ui.md §5.2). */
	updatedBy: Id;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

/** How far ahead a series' sessions exist: reminders need them there (architecture §5.2). */
export const HORIZON_DAYS = 21;
/** The furthest ahead anything can be planned, or a week asked for. */
export const MAX_AHEAD_DAYS = 366;
/** The longest span one request can list: six weeks covers a month view later. */
export const MAX_RANGE_DAYS = 42;
/** Series still running in a household; far more than anyone plans, it bounds the work per read. */
export const PLANS_MAX = 100;
/** Times are picked in 5-minute steps, matching the reminder tick (ui.md J3). */
export const TIME_STEP_MIN = 5;

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** The dates a series falls on from `from` to `through`, both inclusive. */
export function occurrenceDates(
	plan: Pick<TrainingPlan, 'startDate' | 'days' | 'until'>,
	from: PlainDate,
	through: PlainDate
): PlainDate[] {
	const first = maxDate(from, plan.startDate);
	const last = plan.until ? minDate(through, plan.until) : through;
	const dates: PlainDate[] = [];
	for (let i = 0, n = daysBetween(first, last); i <= n; i++) {
		const date = addDays(first, i);
		if (plan.days.includes(weekday(date))) dates.push(date);
	}
	return dates;
}

/** Whether the series can still fall on `date` or later. */
export const runsOnOrAfter = (plan: Pick<TrainingPlan, 'until'>, date: PlainDate): boolean =>
	plan.until === undefined || plan.until >= date;

/** What a person picks when scheduling (ui.md J3). */
export interface ScheduleInput {
	date: string;
	time: string;
	repeat?: { days: number[]; until?: string | undefined } | null | undefined;
}

export interface Schedule {
	date: PlainDate;
	time: PlainTime;
	repeat: Repeat | null;
}

/**
 * Checks a date, time and repeat rule against the household's today. Field errors are keyed
 * `date`, `time`, `repeat.days` and `repeat.until`.
 */
export function checkSchedule(
	input: ScheduleInput,
	today: PlainDate
): { ok: true; value: Schedule } | { ok: false; fields: Record<string, string[]> } {
	const fields: Record<string, string[]> = {};
	const latest = addDays(today, MAX_AHEAD_DAYS);

	if (!isPlainDate(input.date)) fields.date = ['Choose a date.'];
	else if (input.date < today) fields.date = ['Choose today or a later date.'];
	else if (input.date > latest) fields.date = ['Choose a date within the next year.'];

	if (!isPlainTime(input.time)) fields.time = ['Choose a time.'];
	else if (Number(input.time.slice(3)) % TIME_STEP_MIN !== 0) {
		fields.time = [`Choose a time in ${TIME_STEP_MIN}-minute steps.`];
	}

	let repeat: Repeat | null = null;
	if (input.repeat) {
		const days = [...new Set(input.repeat.days)].sort((a, b) => a - b);
		if (days.length === 0 || !days.every((d) => WEEKDAYS.includes(d as Weekday))) {
			fields['repeat.days'] = ['Choose at least one day.'];
		}
		const until = input.repeat.until;
		if (until !== undefined) {
			if (!isPlainDate(until)) fields['repeat.until'] = ['Choose an end date.'];
			else if (isPlainDate(input.date) && until < input.date) {
				fields['repeat.until'] = ['End on or after the first date.'];
			} else if (until > latest) fields['repeat.until'] = ['End within the next year.'];
		}
		repeat = {
			days: days as Weekday[],
			...(until !== undefined && { until: until as PlainDate })
		};
	}

	if (Object.keys(fields).length > 0) return { ok: false, fields };
	return {
		ok: true,
		value: { date: input.date as PlainDate, time: input.time as PlainTime, repeat }
	};
}

/** The statuses a person can set: completing is the quick log's (S7). */
export type SettableStatus = Exclude<SessionStatus, 'completed'>;
