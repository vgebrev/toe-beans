// Bringing a deleted event back: the snackbar's Undo (architecture §5.3, ui.md J8), with If-Match
// from the delete.
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function POST({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.behaviourEvents.restore(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match')
		})
	);
}
