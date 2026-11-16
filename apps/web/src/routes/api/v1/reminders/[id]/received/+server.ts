// The service worker reports a reminder reaching the phone (ui.md J7).
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function POST({ locals, params }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.reminders.received(locals.viewer, { id: params.id }));
}
