// Readiness: the database answers (architecture §8.1). 503 while it doesn't.
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET() {
	return toResponse(await backend().http.health.readiness());
}
