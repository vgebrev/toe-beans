// When a practice happened, on the household's clocks (ui.md §4.2, §5.4). The quick choices are
// relative to now; *Earlier* picks a date and time, which become an instant in the household's
// time zone so the server and every caregiver read the same moment.

export type WhenChoice = 'now' | '15' | '60' | 'earlier';

export const whenLabels: Record<WhenChoice, string> = {
	now: 'Now',
	'15': '15 min ago',
	'60': '1 h ago',
	earlier: 'Earlier'
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function wallClockMs(ms: number, timeZone: string): number {
	let f = formatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
		formatters.set(timeZone, f);
	}
	const p: Record<string, number> = {};
	for (const part of f.formatToParts(ms))
		if (part.type !== 'literal') p[part.type] = Number(part.value);
	return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!);
}

/**
 * The instant the household's clocks show `date` at `time`. Two rounds of the zone's offset settle
 * it; on a daylight-saving change it's within the hour, which is fine for a log.
 */
export function instantIn(date: string, time: string, timeZone: string): Date {
	const wall = Date.parse(`${date}T${time}:00Z`);
	let ms = wall;
	for (let i = 0; i < 2; i++)
		ms = wall - (wallClockMs(ms, timeZone) - Math.floor(ms / 60_000) * 60_000);
	return new Date(ms);
}

/** The date and time (`HH:MM`) the household's clocks show at `instant`. */
export function zonedParts(instant: Date, timeZone: string): { date: string; time: string } {
	const iso = new Date(wallClockMs(instant.getTime(), timeZone)).toISOString();
	return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** The instant to send, or undefined for now (the server's clock decides). */
export function practisedAt(
	choice: WhenChoice,
	picked: { date: string; time: string },
	timeZone: string,
	now = new Date()
): string | undefined {
	if (choice === 'now') return undefined;
	if (choice === 'earlier') return instantIn(picked.date, picked.time, timeZone).toISOString();
	return new Date(now.getTime() - Number(choice) * 60_000).toISOString();
}
