// One dog's profile (ui.md §4.5). Another household's dog is the same 404 as a missing one (§4.4).
import { error } from '@sveltejs/kit';
import { Dog } from '@toe-beans/contracts';
import { createApiClient, problemStatus } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const dog = await createApiClient(fetch).get(`/dogs/${params.id}`, Dog);
	if (!dog.ok && problemStatus(dog.error) === 404) {
		error(404, 'Not found');
	}
	return { dog: dog.ok ? dog.data : null };
}
