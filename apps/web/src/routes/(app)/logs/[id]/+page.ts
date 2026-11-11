// One session log (ui.md §2.3), to read and edit (J8). Another household's log, or one that's
// gone, is a 404 page (architecture §4.4).
import { error } from '@sveltejs/kit';
import { SessionLog } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, params, parent }) {
	const { household } = await parent();
	const log = await createApiClient(fetch).get(`/session-logs/${params.id}`, SessionLog);
	if (!log.ok && log.error.kind === 'problem' && log.error.problem.status === 404) {
		error(404, 'Not found');
	}
	return { today: todayIn(household.timeZone), log: log.ok ? log.data : null };
}
