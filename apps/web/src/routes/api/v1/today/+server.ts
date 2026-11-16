// The household's day (architecture §5.1, D26, FR-06): overdue, planned, done and skipped.
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.today.get(locals.viewer));
}
