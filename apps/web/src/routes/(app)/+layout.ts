// The household's dogs, for the switcher and every page that names a dog (ui.md §2.2). Null when
// the API didn't answer, which pages treat as "couldn't load" rather than "no dogs".
import { Dogs } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ data, fetch }) {
	const dogs = await createApiClient(fetch).get('/dogs', Dogs);
	return { ...data, dogs: dogs.ok ? dogs.data.dogs : null };
}
