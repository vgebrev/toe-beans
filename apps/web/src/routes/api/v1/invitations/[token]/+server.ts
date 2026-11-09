// What `/join/:token` shows. The one API route that works signed out (hooks.server.ts).
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ locals, params, getClientAddress }) {
	return toResponse(
		await backend().http.household.previewInvitation({
			token: params.token,
			viewer: locals.viewer,
			clientAddress: getClientAddress()
		})
	);
}
