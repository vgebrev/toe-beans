// Revoking an invitation (architecture §5.2).
import { backend } from '#lib/server/backend.js';
import { toResponse, unauthenticated } from '#lib/server/respond.js';

export async function DELETE({ locals, params, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.household.revokeInvitation(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match')
		})
	);
}
