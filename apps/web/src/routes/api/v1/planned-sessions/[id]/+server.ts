// One planned session: reading it (the notification deep link's target, ui.md J7) and changing
// this session only, against its ETag (architecture §3.3).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals, params }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.planner.get(locals.viewer, { id: params.id }));
}

export async function PATCH({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.planner.update(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await jsonBody(request)
		})
	);
}
