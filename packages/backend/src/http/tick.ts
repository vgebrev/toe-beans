// POST /internal/tick (architecture §6.3): Cloud Scheduler, or another host's cron, runs the
// reminder tick. Only a caller the TickAuthenticator accepts gets in; anyone else learns nothing
// from the answer.
import type { Logger } from '../application/ports/index.js';
import type { ReminderTick, TickAuthenticator } from '../application/ports/tick.js';
import { json, noContent, type HttpResponse } from './response.js';

export interface WorkerHttp {
	tick(input: { authorization: string | null; scheduledAt: string | null }): Promise<HttpResponse>;
}

export function createWorkerHttp(
	worker: ReminderTick,
	{ auth, logger }: { auth: TickAuthenticator; logger: Logger }
): WorkerHttp {
	const log = logger.child({ component: 'worker' });
	return {
		async tick({ authorization, scheduledAt }) {
			if (!(await auth.verify(authorization))) {
				log.warn('tick refused');
				return { ...noContent(), status: 401 };
			}
			const started = Date.now();
			const report = await worker.tick();
			// Cloud Scheduler says when it meant to call; the lag shows how late ticks run (S-1.3).
			const lagMs = scheduledAt ? started - Date.parse(scheduledAt) : undefined;
			if (lagMs !== undefined && Number.isFinite(lagMs)) log.debug('tick lag', { lagMs });
			return json(report);
		}
	};
}
