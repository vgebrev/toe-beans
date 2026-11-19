// The viewer's household (architecture §3.3), and deleting it when they're its only member (D38).
// hooks.server.ts already answers 401 to signed-out API calls; the check here only narrows the type.
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.household.get(locals.viewer));
}

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.household.create(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}

export async function DELETE({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.household.delete(locals.viewer, {
			ifMatch: request.headers.get('if-match')
		})
	);
}
