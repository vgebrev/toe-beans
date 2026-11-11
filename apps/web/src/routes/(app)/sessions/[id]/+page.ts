// One planned session (ui.md §2.3), also where a reminder's tap will land (J7). Another
// household's session, or one that's gone, is a 404 page (architecture §4.4).
import { error } from '@sveltejs/kit';
import { PlannedSession } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, params, parent }) {
	const { household } = await parent();
	const session = await createApiClient(fetch).get(
		`/planned-sessions/${params.id}`,
		PlannedSession
	);
	if (!session.ok && session.error.kind === 'problem' && session.error.problem.status === 404) {
		error(404, 'Not found');
	}
	return { today: todayIn(household.timeZone), session: session.ok ? session.data : null };
}
