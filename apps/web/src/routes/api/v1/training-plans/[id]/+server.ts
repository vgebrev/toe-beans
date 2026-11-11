// A repeating plan, changed from one of its sessions on (*This and following*, ui.md §4.3),
// against the plan's ETag.
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function PATCH({ locals, params, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.planner.updateSeries(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await request.json().catch(() => undefined)
		})
	);
}
