// One care task (ui.md §2.3, J6), also where a care reminder's tap lands (J7). Another
// household's task, or one that's gone, is a 404 page (architecture §4.4).
import { CareTask } from '@toe-beans/contracts';
import { found } from '#lib/api-client/found.js';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, params, parent }) {
	const { household } = await parent();
	const task = await createApiClient(fetch).get(`/care-tasks/${params.id}`, CareTask);
	return { today: todayIn(household.timeZone), task: found(task) };
}
