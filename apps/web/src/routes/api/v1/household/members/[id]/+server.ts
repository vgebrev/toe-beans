// Removing a member, or leaving when it's the viewer's own ID (architecture §5.2, D18), and changing
// their role (D19).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function PATCH({ locals, params, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.household.changeMemberRole(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await request.json().catch(() => undefined)
		})
	);
}

export async function DELETE({ locals, params, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.household.removeMember(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match')
		})
	);
}
