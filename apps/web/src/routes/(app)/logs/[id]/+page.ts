// One session log (ui.md §2.3), to read and edit (J8). Another household's log, or one that's
// gone, is a 404 page (architecture §4.4).
import { SessionLog } from '@toe-beans/contracts';
import { found } from '#lib/api-client/found.js';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, params, parent }) {
	const { household } = await parent();
	const log = await createApiClient(fetch).get(`/session-logs/${params.id}`, SessionLog);
	return { today: todayIn(household.timeZone), log: found(log) };
}
