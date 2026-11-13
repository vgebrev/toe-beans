// The care calendar: the Care tab's list, and adding a task (architecture §5.2, D30, FR-10).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.careTasks.list(locals.viewer));
}

export async function POST({ locals, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.careTasks.create(locals.viewer, {
			body: await request.json().catch(() => undefined)
		})
	);
}
