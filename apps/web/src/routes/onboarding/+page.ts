// The name from sign-in, with the ETag saving it needs (architecture §3.3).
import { Profile } from '@toe-beans/contracts';
import { createApiClient } from '#lib/api-client/index.js';

export async function load({ fetch }) {
	const me = await createApiClient(fetch).get('/me', Profile);
	return { me: me.ok && me.etag ? { profile: me.data, etag: me.etag } : null };
}
