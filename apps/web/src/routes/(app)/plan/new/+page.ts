// Scheduling (ui.md J3): the library for the picker, and `?date=` and `?exercise=` to start from,
// from Plan's chosen day or an exercise's Schedule button.
import { Exercises } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';
import { isPlainDate, todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, url, parent }) {
	const { household } = await parent();
	const today = todayIn(household.timeZone);
	const exercises = await createApiClient(fetch).get('/exercises', Exercises);
	const date = url.searchParams.get('date');
	return {
		today,
		exercises: exercises.ok ? exercises.data.exercises : null,
		date: isPlainDate(date) && date >= today ? date : today,
		exerciseId: url.searchParams.get('exercise')
	};
}
