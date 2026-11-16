// Logging a practice (architecture §5.2, D25, FR-07): ad hoc, or completing a planned session.
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.sessionLogs.create(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
