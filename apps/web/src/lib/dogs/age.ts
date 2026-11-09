// A dog's age and time since adoption in words (ui.md §4.5, §5.4): "4 months", "about 2 years".
// Dates are plain `YYYY-MM-DD` in the household's time zone, so no clock or zone maths is needed.
import type { BirthDate } from '@toe-beans/contracts';

/** Today's date in a time zone, as `YYYY-MM-DD`. */
export const todayIn = (timeZone: string, now = new Date()): string =>
	new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
		.format(now)
		.slice(0, 10);

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];

/** Whole months from `from` to `to`: 31 Jan to 28 Feb is 0, to 1 Mar is 1. */
export function monthsBetween(from: string, to: string): number {
	const [fy, fm, fd] = parts(from);
	const [ty, tm, td] = parts(to);
	const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
	return Math.max(0, months);
}

const daysBetween = (from: string, to: string) =>
	Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** The span in the largest unit that reads well: weeks under 2 months, months under 2 years. */
function span(from: string, to: string): string {
	const months = monthsBetween(from, to);
	if (months >= 24) return plural(Math.floor(months / 12), 'year');
	if (months >= 2) return plural(months, 'month');
	const days = daysBetween(from, to);
	if (days >= 14) return plural(Math.floor(days / 7), 'week');
	return plural(days, 'day');
}

/** "4 months", or "about 4 months" when the birth date is an estimate. */
export function ageText(birth: BirthDate, today: string): string {
	const text = span(birth.date, today);
	return birth.precision === 'day' ? text : `about ${text}`;
}

/** "Adopted 3 months ago", "Adopted today". */
export function adoptedText(adoptionDate: string, today: string): string {
	if (adoptionDate >= today) return 'Adopted today';
	return `Adopted ${span(adoptionDate, today)} ago`;
}

/** The date `months` before `today`, for "Approximate: months old" (ui.md J1). */
export function monthsAgo(months: number, today: string): string {
	const [y, m, d] = parts(today);
	const target = new Date(Date.UTC(y, m - 1 - months, 1));
	// Clamp the day to the target month's length: 3 months before 31 May is 28 or 29 Feb.
	const lastDay = new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
	).getUTCDate();
	target.setUTCDate(Math.min(d, lastDay));
	return target.toISOString().slice(0, 10);
}
