// The household's planned sessions (architecture §5.2, D24, FR-05): a range of dates to list, or
// a new session or series to schedule.
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function GET({ locals, url }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.planner.list(locals.viewer, {
			from: url.searchParams.get('from'),
			to: url.searchParams.get('to')
		})
	);
}

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.planner.create(locals.viewer, {
			body: await jsonBody(request)
		})
	);
}
