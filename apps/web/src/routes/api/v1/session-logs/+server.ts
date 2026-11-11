// Logging a practice (architecture §5.2, D25, FR-07): ad hoc, or completing a planned session.
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ locals, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.sessionLogs.create(locals.viewer, {
			body: await request.json().catch(() => undefined)
		})
	);
}
