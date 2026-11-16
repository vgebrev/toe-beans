// Saves this browser's push subscription for the signed-in person (architecture §6, D27).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function PUT({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.reminders.saveDevice(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
