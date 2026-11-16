// Changing a session (ui.md §4.3): `?scope=this` for this session only, `following` for this and
// the rest of its series.
import { Exercises, PlannedSession } from '@toe-beans/contracts';
import { found } from '#lib/api-client/found.js';
import { createApiClient } from '#lib/api-client/index.js';
import { todayIn } from '#lib/planner/dates.js';

export async function load({ fetch, params, parent, url }) {
	const { household } = await parent();
	const api = createApiClient(fetch);
	const [session, exercises] = await Promise.all([
		api.get(`/planned-sessions/${params.id}`, PlannedSession),
		api.get('/exercises', Exercises)
	]);
	const planned = found(session);
	const scope = url.searchParams.get('scope') === 'following' ? 'following' : 'this';
	return {
		today: todayIn(household.timeZone),
		session: planned,
		exercises: exercises.ok ? exercises.data.exercises : null,
		// Only a session of a series has following ones.
		scope: planned && !planned.plan ? ('this' as const) : scope
	};
}
