// The viewer's household (architecture §3.3). hooks.server.ts already answers 401 to signed-out API
// calls; the check here only narrows the type.
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.household.get(locals.viewer));
}

export async function POST({ locals, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.household.create(locals.viewer, {
			body: await request.json().catch(() => undefined)
		})
	);
}
