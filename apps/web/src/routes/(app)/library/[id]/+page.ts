// One exercise's instructions (ui.md §4.6). An unknown ID is a 404 page.
import { Exercise } from '@toe-beans/contracts';
import { found } from '#lib/api-client/found.js';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const exercise = await createApiClient(fetch).get(`/exercises/${params.id}`, Exercise);
	return { exercise: found(exercise) };
}
