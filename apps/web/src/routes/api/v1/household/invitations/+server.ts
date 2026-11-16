// Invitations that can still be used, and new ones (architecture §5.2).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.household.listInvitations(locals.viewer));
}

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.household.createInvitation(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
