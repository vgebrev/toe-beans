// Account details come from the API, with the ETag an edit must send back (architecture §3.3).
import { Profile } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch }) {
	const me = await createApiClient(fetch).get('/me', Profile);
	return { me: me.ok && me.etag ? { profile: me.data, etag: me.etag } : null };
}
