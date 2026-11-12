// What the signed-in person wants reminding of. Only they change it, so no If-Match (D27).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function PUT({ locals, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.reminders.savePreference(locals.viewer, {
			body: await request.json().catch(() => undefined)
		})
	);
}
