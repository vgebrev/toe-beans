// The Notifications screen's state: the person's devices, preference and latest test (ui.md J7).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.reminders.settings(locals.viewer));
}
