// One exercise's instructions (ui.md §4.6). An unknown ID is a 404 page.
import { error } from '@sveltejs/kit';
import { Exercise } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const exercise = await createApiClient(fetch).get(`/exercises/${params.id}`, Exercise);
	if (!exercise.ok && exercise.error.kind === 'problem' && exercise.error.problem.status === 404) {
		error(404, 'Not found');
	}
	return { exercise: exercise.ok ? exercise.data : null };
}
