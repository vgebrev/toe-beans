// Joining the household the invitation belongs to (architecture §5.2).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ locals, params, getClientAddress }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.household.acceptInvitation({
			token: params.token,
			viewer: locals.viewer,
			clientAddress: getClientAddress()
		})
	);
}
