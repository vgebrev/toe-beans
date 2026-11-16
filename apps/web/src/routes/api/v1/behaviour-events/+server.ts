// Recording a behaviour event (architecture §5.2, D28, FR-08).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.behaviourEvents.create(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
