// History (ui.md §4.4, FR-09): the library, for the exercise filter's names and picker, and the
// household's today for day headings. The timeline itself is fetched by the page, since the dog
// it filters by is the switcher's, which only the device knows (§2.2).
import { Exercises } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, parent }) {
	const { household } = await parent();
	const exercises = await createApiClient(fetch).get('/exercises', Exercises);
	return {
		today: todayIn(household.timeZone),
		exercises: exercises.ok ? exercises.data.exercises : null
	};
}
