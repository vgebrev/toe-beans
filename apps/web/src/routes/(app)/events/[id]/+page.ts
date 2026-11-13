// One behaviour event (ui.md §2.3), to read and edit (J8). Another household's event, or one
// that's gone, is a 404 page (architecture §4.4).
import { error } from '@sveltejs/kit';
import { BehaviourEvent } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, params, parent }) {
	const { household } = await parent();
	const event = await createApiClient(fetch).get(`/behaviour-events/${params.id}`, BehaviourEvent);
	if (!event.ok && event.error.kind === 'problem' && event.error.problem.status === 404) {
		error(404, 'Not found');
	}
	return { today: todayIn(household.timeZone), event: event.ok ? event.data : null };
}
