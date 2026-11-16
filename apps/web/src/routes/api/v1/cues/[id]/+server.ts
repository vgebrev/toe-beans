// One cue: reading, changing and deleting it, each change against its ETag (architecture §3.3).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals, params }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.cues.get(locals.viewer, { id: params.id }));
}

export async function PATCH({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.cues.update(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await jsonBody(request)
		})
	);
}

export async function DELETE({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.cues.remove(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match')
		})
	);
}
