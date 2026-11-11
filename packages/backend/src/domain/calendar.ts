// Calendar dates and wall-clock times in the household's time zone (architecture §7). Instants are
// stored in UTC; dates and times of day are what people plan in. `Intl` does the zone arithmetic,
// so there's no date library in the domain, and daylight saving rules come from the platform's
// time zone data.

/** A calendar date with no time or zone, `YYYY-MM-DD`. */
export type PlainDate = string & { readonly __brand: 'PlainDate' };

/** A wall-clock time with no date or zone, `HH:MM` on the 24-hour clock. */
export type PlainTime = string & { readonly __brand: 'PlainTime' };

/** ISO weekday: Monday is 1, Sunday 7. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPlainDate(value: string): value is PlainDate {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const [, y, m, d] = match.map(Number) as [number, number, number, number];
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const isPlainTime = (value: string): value is PlainTime =>
	/^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const utcMidnight = (date: PlainDate): number => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number): PlainDate => new Date(ms).toISOString().slice(0, 10) as PlainDate;

export const addDays = (date: PlainDate, days: number): PlainDate =>
	fromUtc(utcMidnight(date) + days * DAY_MS);

/** Whole days from `from` to `to`: negative when `to` is earlier. */
export const daysBetween = (from: PlainDate, to: PlainDate): number =>
	Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);

export function weekday(date: PlainDate): Weekday {
	const day = new Date(utcMidnight(date)).getUTCDay();
	return (day === 0 ? 7 : day) as Weekday;
}

/** Plain dates compare as strings; these read better at the call site. */
export const minDate = (a: PlainDate, b: PlainDate): PlainDate => (a < b ? a : b);
export const maxDate = (a: PlainDate, b: PlainDate): PlainDate => (a > b ? a : b);

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
	let f = formatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		formatters.set(timeZone, f);
	}
	return f;
}

/** The wall clock in `timeZone` at `ms`, read back as if it were UTC. */
function wallClockMs(ms: number, timeZone: string): number {
	const parts: Record<string, number> = {};
	for (const p of formatter(timeZone).formatToParts(ms)) {
		if (p.type !== 'literal') parts[p.type] = Number(p.value);
	}
	return Date.UTC(
		parts.year!,
		parts.month! - 1,
		parts.day!,
		parts.hour!,
		parts.minute!,
		parts.second!
	);
}

/** How far ahead of UTC the zone's clocks are at `ms` (whole seconds). */
const offsetAt = (ms: number, timeZone: string): number =>
	wallClockMs(ms - (ms % 1000), timeZone) - (ms - (ms % 1000));

/** The date and time on the household's clocks at `instant`. */
export function zonedDateTime(
	instant: Date,
	timeZone: string
): { date: PlainDate; time: PlainTime } {
	const iso = new Date(wallClockMs(instant.getTime(), timeZone)).toISOString();
	return { date: iso.slice(0, 10) as PlainDate, time: iso.slice(11, 16) as PlainTime };
}

export const todayIn = (instant: Date, timeZone: string): PlainDate =>
	zonedDateTime(instant, timeZone).date;

/**
 * The instant the household's clocks show `date` at `time`. Like Temporal's `compatible`
 * disambiguation: a time skipped when clocks go forward moves on by the gap (02:30 becomes 03:30),
 * and a time that happens twice when they go back is the first of the two.
 */
export function instantAt(date: PlainDate, time: PlainTime, timeZone: string): Date {
	const wall = Date.parse(`${date}T${time}:00Z`);
	// The offsets a day either side cover any transition near this wall-clock time.
	const before = offsetAt(wall - DAY_MS, timeZone);
	const after = offsetAt(wall + DAY_MS, timeZone);
	const candidates = [wall - before, wall - after].filter(
		(ms) => wallClockMs(ms, timeZone) === wall
	);
	if (candidates.length > 0) return new Date(Math.min(...candidates));
	// In the gap: the clock as it read before the change, carried over it.
	return new Date(wall - before);
}
