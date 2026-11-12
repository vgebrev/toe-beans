// Removes one of the signed-in person's devices: no more reminders go to it.
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function DELETE({ locals, params }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.reminders.removeDevice(locals.viewer, { id: params.id }));
}
