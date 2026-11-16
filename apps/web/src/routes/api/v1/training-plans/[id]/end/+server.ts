// Cancels a repeating plan from one of its sessions on, against the plan's ETag.
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function POST({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.planner.endSeries(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await jsonBody(request)
		})
	);
}
