// One exercise's full instructions (ui.md §4.6).
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export function GET({ locals, params }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(backend().http.exercises.get({ id: params.id }));
}
