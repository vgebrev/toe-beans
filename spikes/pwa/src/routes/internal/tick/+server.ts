// Spike S-1.3: Cloud Scheduler calls this every minute. Each call is logged with its lag behind the
// scheduled time, so `pnpm ticks` can measure reliability over 48 h from Cloud Logging.
import { json } from '@sveltejs/kit';
import { isScheduler } from '#lib/server/tick-auth.js';
import { dispatchDue } from '#lib/server/push.js';
import { ageSeconds, logJson } from '#lib/server/instance.js';

export async function POST({ request }) {
	if (!(await isScheduler(request.headers.get('authorization')))) {
		logJson('tick rejected', {}, 'WARNING');
		return new Response(null, { status: 401 });
	}
	const now = Date.now();
	const scheduledAt = request.headers.get('x-cloudscheduler-scheduletime');
	const dispatched = await dispatchDue(new Date(now));
	logJson('tick', {
		scheduledAt,
		lagMs: scheduledAt ? now - Date.parse(scheduledAt) : null,
		instanceAgeS: Math.round(ageSeconds()),
		dispatched
	});
	return json({ dispatched });
}
