// Starts the delayed test reminder for one of the person's devices (ui.md J7).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ locals, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.reminders.startTest(locals.viewer, {
			body: await request.json().catch(() => undefined)
		})
	);
}
