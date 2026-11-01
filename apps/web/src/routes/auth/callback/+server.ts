// Back from the identity provider: validates its answer and starts a session (architecture §3.4).
// The query holds the one-time code, which is why the access log records the route, never the URL.
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ url, cookies }) {
	return toResponse(
		await backend().http.auth.callback({
			search: url.search,
			cookie: (name) => cookies.get(name)
		})
	);
}
