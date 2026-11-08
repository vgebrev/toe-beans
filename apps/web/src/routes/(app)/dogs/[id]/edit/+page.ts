// The dog being edited, as on its profile.
import { error } from '@sveltejs/kit';
import { Dog } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const dog = await createApiClient(fetch).get(`/dogs/${params.id}`, Dog);
	if (!dog.ok && dog.error.kind === 'problem' && dog.error.problem.status === 404) {
		error(404, 'Not found');
	}
	return { dog: dog.ok ? dog.data : null };
}
