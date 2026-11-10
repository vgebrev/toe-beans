// The household's cue dictionary (architecture §5.2, FR-04).
import { errorResponse } from '@toe-beans/backend';
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(await backend().http.cues.list(locals.viewer));
}

export async function POST({ locals, request }) {
	if (!locals.viewer) return toResponse(errorResponse({ kind: 'unauthenticated' }));
	return toResponse(
		await backend().http.cues.create(locals.viewer, {
			body: await request.json().catch(() => undefined)
		})
	);
}
