// Dates for the planner on the device (ui.md §4.3, §5.4): weeks run Monday to Sunday, "today" is
// the household's, and labels use the device's locale. Plain dates are `YYYY-MM-DD` strings,
// handled as UTC midnights so no zone can move them.
import { limits } from '@toe-beans/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const plain = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const isPlainDate = (value: string | null): value is string =>
	value !== null &&
	/^\d{4}-\d{2}-\d{2}$/.test(value) &&
	!Number.isNaN(utc(value)) &&
	plain(utc(value)) === value;

export const addDays = (date: string, days: number): string => plain(utc(date) + days * DAY_MS);

/**
 * The same day `months` later (or earlier), or the month's last day when it's shorter: 31 January
 * plus a month is 28 or 29 February.
 */
export function addMonths(date: string, months: number): string {
	const [y, m, d] = date.split('-').map(Number) as [number, number, number];
	const first = new Date(Date.UTC(y, m - 1 + months, 1));
	const lastDay = new Date(
		Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
	).getUTCDate();
	first.setUTCDate(Math.min(d, lastDay));
	return first.toISOString().slice(0, 10);
}

/** ISO weekday: Monday is 1, Sunday 7. */
export function weekdayOf(date: string): number {
	const day = new Date(utc(date)).getUTCDay();
	return day === 0 ? 7 : day;
}

/** The Monday of the week `date` is in. */
export const mondayOf = (date: string): string => addDays(date, 1 - weekdayOf(date));

/** The seven dates of the week starting `monday`. */
export const weekDates = (monday: string): string[] =>
	Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** `2026-W46`: the ISO week `date` is in, for the URL (ui.md §2.3). */
export function isoWeek(date: string): string {
	const thursday = addDays(mondayOf(date), 3);
	const year = thursday.slice(0, 4);
	const week = Math.floor((utc(thursday) - utc(`${year}-01-01`)) / (7 * DAY_MS)) + 1;
	return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The Monday of an ISO week like `2026-W46`, or null if it isn't one. */
export function mondayOfIsoWeek(value: string | null): string | null {
	const match = value && /^(\d{4})-W(\d{2})$/.exec(value);
	if (!match) return null;
	const [, year, week] = match;
	// 4 January is always in week 1.
	const monday = addDays(mondayOf(`${year}-01-04`), (Number(week) - 1) * 7);
	return isoWeek(monday) === value ? monday : null;
}

/** Today's date in a time zone, as `YYYY-MM-DD`: the household's, given its zone. */
export const todayIn = (timeZone: string, now = new Date()): string =>
	new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
		.format(now)
		.slice(0, 10);

/** A plain date in the device's locale, e.g. "Tue 10 Nov". */
export const formatDate = (
	date: string,
	options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
	locale?: string
): string => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(utc(date));

/** "Today", "Tomorrow", or the date (ui.md §5.4). */
export function dayName(date: string, today: string, locale?: string): string {
	if (date === today) return 'Today';
	if (date === addDays(today, 1)) return 'Tomorrow';
	if (date === addDays(today, -1)) return 'Yesterday';
	return formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' }, locale);
}

/** The same, mid-sentence: "today", "tomorrow", or the date. */
export const dayPhrase = (date: string, today: string, locale?: string): string => {
	const name = dayName(date, today, locale);
	return ['Today', 'Tomorrow', 'Yesterday'].includes(name) ? name.toLowerCase() : name;
};

/** "9–15 Nov" (or "Nov 9 – 15"), as the device's locale orders a range. */
export const weekRange = (monday: string, locale?: string): string =>
	new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).formatRange(
		utc(monday),
		utc(addDays(monday, 6))
	);

export const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAYS = [1, 2, 3, 4, 5];

/** The short weekday names, Monday first, in the device's locale. */
export const weekdayNames = (style: 'short' | 'long' = 'short', locale?: string): string[] =>
	weekDates('2026-11-09').map((d) => formatDate(d, { weekday: style }, locale));

const same = (a: readonly number[], b: readonly number[]) =>
	a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * "Every day", "Weekdays" or "Mon, Wed, Fri", then "at 07:00, 12:00 and 18:00" when it's
 * several times a day, then "until 1 Dec" when it ends.
 */
export function repeatSummary(
	{
		days,
		until,
		times = []
	}: { days: readonly number[]; until?: string; times?: readonly string[] },
	locale?: string
): string {
	const names = weekdayNames('short', locale);
	const which = same(days, EVERY_DAY)
		? 'Every day'
		: same(days, WEEKDAYS)
			? 'Weekdays'
			: `Every ${days.map((d) => names[d - 1]).join(', ')}`;
	const at =
		times.length > 1
			? ` at ${new Intl.ListFormat(locale ?? 'en-GB', { type: 'conjunction' }).format(times)}`
			: '';
	return until
		? `${which}${at} until ${formatDate(until, { day: 'numeric', month: 'short' }, locale)}`
		: `${which}${at}`;
}

/** Times are planned in steps (ui.md J3): rounds to the nearest, keeping the hour valid. */
export function roundTime(value: string): string {
	const match = /^(\d{2}):(\d{2})/.exec(value);
	if (!match) return value;
	const step = limits.timeStepMin;
	const total = Math.min(
		Number(match[1]) * 60 + Math.round(Number(match[2]) / step) * step,
		24 * 60 - step
	);
	return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
