// The app opened with reminders on: marks this browser's device in use (architecture D43).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.reminders.deviceSeen(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
