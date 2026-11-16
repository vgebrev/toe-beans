// Today (ui.md §4.1, FR-06): every dog's day from the API; the page filters by the switcher's dog.
import { Today } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch }) {
	const today = await createApiClient(fetch).get('/today', Today);
	return { today: today.ok ? today.data : null };
}
