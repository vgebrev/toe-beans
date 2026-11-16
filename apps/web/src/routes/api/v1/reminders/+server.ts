// The Notifications screen's state: the person's devices, preference and latest test (ui.md J7).
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.reminders.settings(locals.viewer));
}
