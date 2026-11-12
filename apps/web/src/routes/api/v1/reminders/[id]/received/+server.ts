// The service worker reports a reminder reaching the phone (ui.md J7).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ locals, params }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.reminders.received(locals.viewer, { id: params.id }));
}
