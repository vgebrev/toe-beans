// What the signed-in person wants reminding of. Only they change it, so no If-Match (D27).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function PUT({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.reminders.savePreference(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
