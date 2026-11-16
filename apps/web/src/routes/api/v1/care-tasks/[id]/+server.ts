// One care task: reading it with its history, and changing, cancelling or putting it back
// against its ETag (architecture §3.3, D30, FR-10).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals, params }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.careTasks.get(locals.viewer, { id: params.id }));
}

export async function PATCH({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.careTasks.update(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await jsonBody(request)
		})
	);
}
