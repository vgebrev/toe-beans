// The household the viewer was the last to leave, bringing it back (architecture D18), and deleting
// it before it runs out (D38). There's no ID to send: the only one it can reach is the one recorded
// against the viewer.
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.household.getFormer(locals.viewer));
}

export async function POST({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.household.reactivate(locals.viewer));
}

export async function DELETE({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.household.deleteFormer(locals.viewer));
}
