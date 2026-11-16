// The exercise library (architecture §3.8): everyone signed in can read it.
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(backend().http.exercises.list());
}
