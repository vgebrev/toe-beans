// One dog's profile (ui.md §4.5). Another household's dog is the same 404 as a missing one (§4.4).
import { Dog } from '@toe-beans/contracts';
import { found } from '#lib/api-client/found.js';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const dog = await createApiClient(fetch).get(`/dogs/${params.id}`, Dog);
	return { dog: found(dog) };
}
