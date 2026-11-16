// The week on Plan (ui.md §4.3): `?week=2026-W46`, else the household's current week. The day
// shown is the page's to pick, so changing it doesn't fetch the week again.
import { PlannedSessions } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';
import { addDays, mondayOf, mondayOfIsoWeek, todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, url, parent }) {
	const { household } = await parent();
	const today = todayIn(household.timeZone);
	const monday = mondayOfIsoWeek(url.searchParams.get('week')) ?? mondayOf(today);
	const sessions = await createApiClient(fetch).get(
		`/planned-sessions?from=${monday}&to=${addDays(monday, 6)}`,
		PlannedSessions
	);
	return { today, monday, sessions: sessions.ok ? sessions.data.sessions : null };
}
