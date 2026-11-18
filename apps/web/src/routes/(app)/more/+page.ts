// Account details come from the API, with the ETag an edit must send back (architecture §3.3).
// The members tell the delete sheet what happens to the household (D38).
import { Household, Profile } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch }) {
	const api = createApiClient(fetch);
	const [me, household] = await Promise.all([
		api.get('/me', Profile),
		api.get('/household', Household)
	]);
	return {
		me: me.ok && me.etag ? { profile: me.data, etag: me.etag } : null,
		members: household.ok ? household.data.members : null
	};
}
