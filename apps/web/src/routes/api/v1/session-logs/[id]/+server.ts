// One session log: reading it, editing it against its ETag and deleting it (architecture §3.3,
// §5.3, FR-07, FR-09).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals, params }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.sessionLogs.get(locals.viewer, { id: params.id }));
}

export async function PATCH({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.sessionLogs.update(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await jsonBody(request)
		})
	);
}

export async function DELETE({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.sessionLogs.remove(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match')
		})
	);
}
