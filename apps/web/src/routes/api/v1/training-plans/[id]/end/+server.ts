// Cancels a repeating plan from one of its sessions on, against the plan's ETag.
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ locals, params, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.planner.endSeries(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await request.json().catch(() => undefined)
		})
	);
}
