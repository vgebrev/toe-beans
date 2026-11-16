// "Last edited by Sam, 2 days ago" (ui.md §4.6, §5.4): today-relative wording for the last week,
// then the date in the household's time zone.
import { todayIn } from '#lib/planner/dates.js';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", "on Tue 28 Oct". */
export function editedWhen(iso: string, now: Date, timeZone: string, locale?: string): string {
	const at = new Date(iso);
	const elapsed = Math.max(0, now.getTime() - at.getTime());
	if (elapsed < MINUTE) return 'just now';
	if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), 'minute');
	// Days count as the household sees them.
	const days = Math.round(
		(Date.parse(todayIn(timeZone, now)) - Date.parse(todayIn(timeZone, at))) / 86_400_000
	);
	if (days === 0) return relative.format(-Math.floor(elapsed / HOUR), 'hour');
	if (days < 7) return relative.format(-days, 'day');
	const sameYear = todayIn(timeZone, now).slice(0, 4) === todayIn(timeZone, at).slice(0, 4);
	const date = new Intl.DateTimeFormat(locale, {
		timeZone,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' })
	}).format(at);
	return `on ${date.replace(/,/g, '')}`;
}
