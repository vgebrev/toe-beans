// The reminder tick, for Cloud Scheduler or another host's cron (architecture §6.3). The handler
// checks the caller's bearer token; hooks.server.ts lets it past the origin check.
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ request }) {
	return toResponse(
		await backend().http.worker.tick({
			authorization: request.headers.get('authorization'),
			scheduledAt: request.headers.get('x-cloudscheduler-scheduletime')
		})
	);
}
