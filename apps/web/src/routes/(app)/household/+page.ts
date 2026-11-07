// Who's in the household and who's been invited (ui.md §4.8), read in parallel.
import { Household, Invitations } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch }) {
	const api = createApiClient(fetch);
	const [household, invitations] = await Promise.all([
		api.get('/household', Household),
		api.get('/household/invitations', Invitations)
	]);
	return {
		details: household.ok ? household.data : null,
		etag: household.ok ? household.etag : undefined,
		invitations: invitations.ok ? invitations.data.invitations : null
	};
}
