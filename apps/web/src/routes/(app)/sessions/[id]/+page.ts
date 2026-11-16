// One planned session (ui.md §2.3), also where a reminder's tap will land (J7). Another
// household's session, or one that's gone, is a 404 page (architecture §4.4).
import { PlannedSession } from '@toe-beans/contracts';
import { found } from '#lib/api-client/found.js';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, params, parent }) {
	const { household } = await parent();
	const session = await createApiClient(fetch).get(
		`/planned-sessions/${params.id}`,
		PlannedSession
	);
	return { today: todayIn(household.timeZone), session: found(session) };
}
