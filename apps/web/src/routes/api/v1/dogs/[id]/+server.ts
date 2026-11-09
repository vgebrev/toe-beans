// One dog: its details, and archiving it (architecture §5.2).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ locals, params }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.dogs.get(locals.viewer, { id: params.id }));
}

export async function PATCH({ locals, params, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.dogs.update(locals.viewer, {
			id: params.id,
			ifMatch: request.headers.get('if-match'),
			body: await request.json().catch(() => undefined)
		})
	);
}
