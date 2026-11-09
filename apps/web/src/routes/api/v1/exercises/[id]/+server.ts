// One exercise's full instructions (ui.md §4.6).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export function GET({ locals, params }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(backend().http.exercises.get({ id: params.id }));
}
