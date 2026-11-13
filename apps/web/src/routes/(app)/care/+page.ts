// The Care tab (ui.md §2.1, J6, FR-10): every current dog's care tasks; the page filters by the
// switcher's dog.
import { CareTasks } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, parent }) {
	const { household } = await parent();
	const care = await createApiClient(fetch).get('/care-tasks', CareTasks);
	return { today: todayIn(household.timeZone), care: care.ok ? care.data : null };
}
