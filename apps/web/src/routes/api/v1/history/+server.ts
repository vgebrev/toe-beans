// History: the household's logs and events in one timeline, a page at a time (architecture §5.1,
// FR-09).
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals, url }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.history.list(locals.viewer, {
			query: Object.fromEntries(url.searchParams)
		})
	);
}
