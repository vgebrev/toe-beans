// The exercise library (ui.md §4.6), filtered by `?area=` so a chip is a link that survives reloads.
import { Exercises } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';
import { skillAreaParam } from '#lib/exercises/skill-areas.js';

export async function load({ fetch, url }) {
	const exercises = await createApiClient(fetch).get('/exercises', Exercises);
	return {
		exercises: exercises.ok ? exercises.data.exercises : null,
		area: skillAreaParam(url.searchParams.get('area'))
	};
}
