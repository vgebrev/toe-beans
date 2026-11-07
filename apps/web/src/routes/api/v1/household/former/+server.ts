// The household the viewer was the last to leave, and bringing it back (architecture D18). There's
// no ID to send: the only one it can reach is the one recorded against the viewer.
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.household.getFormer(locals.viewer));
}

export async function POST({ locals }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.household.reactivate(locals.viewer));
}
