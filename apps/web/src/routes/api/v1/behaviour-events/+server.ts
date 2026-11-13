// Recording a behaviour event (architecture §5.2, D28, FR-08).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ locals, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.behaviourEvents.create(locals.viewer, {
			body: await request.json().catch(() => undefined)
		})
	);
}
