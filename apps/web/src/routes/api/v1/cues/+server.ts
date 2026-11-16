// The household's cue dictionary (architecture §5.2, FR-04).
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(await backend().http.cues.list(locals.viewer));
}

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.cues.create(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
