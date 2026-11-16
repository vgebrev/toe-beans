// The dog being edited, as on its profile.
import { Dog } from '@toe-beans/contracts';
import { found } from '#lib/api-client/found.js';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch, params }) {
	const dog = await createApiClient(fetch).get(`/dogs/${params.id}`, Dog);
	return { dog: found(dog) };
}
