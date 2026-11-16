// Starts the delayed test reminder for one of the person's devices (ui.md J7).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.reminders.startTest(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
