// Bringing a deleted log back: the snackbar's Undo (architecture §5.3, ui.md J8), with If-Match
// from the delete.
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ locals, params, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.sessionLogs.restore(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match')
		})
	);
}
