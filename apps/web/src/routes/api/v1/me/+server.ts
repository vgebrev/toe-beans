// The signed-in person's own account (architecture §3.3), and deleting it (D38). hooks.server.ts
// already answers 401 to signed-out API calls; the check here only narrows the type.
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.account.get(locals.viewer.auth));
}

export async function PATCH({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.account.update(locals.viewer.auth, {
			ifMatch: request.headers.get('if-match'),
			body: await jsonBody(request)
		})
	);
}

export async function DELETE({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.account.delete(locals.viewer.auth));
}
