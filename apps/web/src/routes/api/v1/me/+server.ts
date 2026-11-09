// The signed-in person's own account (architecture §3.3). hooks.server.ts already answers 401 to
// signed-out API calls; the check here only narrows the type.
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.account.get(locals.viewer.auth));
}

export async function PATCH({ locals, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.account.update(locals.viewer.auth, {
			ifMatch: request.headers.get('if-match'),
			body: await request.json().catch(() => undefined)
		})
	);
}
