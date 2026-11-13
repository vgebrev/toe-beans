// Adding a care task (ui.md J6): `?date=` to start from, if any.
import { isPlainDate, todayIn } from '#lib/planner/dates.js';

export async function load({ url, parent }) {
	const { household } = await parent();
	const date = url.searchParams.get('date');
	return { today: todayIn(household.timeZone), date: isPlainDate(date) ? date : '' };
}
