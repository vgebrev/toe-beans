// The household this person can bring back, if any (architecture D18).
import { FormerHousehold } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch }) {
	const former = await createApiClient(fetch).get('/household/former', FormerHousehold);
	return { former: former.ok ? former.data : null };
}
