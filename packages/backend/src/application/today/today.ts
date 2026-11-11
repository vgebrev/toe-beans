// The Today read model (architecture §5.1, D26, FR-06): what the household should do today, every
// dog's, computed on its clocks. No aggregate of its own: it reads the planner and the log.
//
// - Overdue: still planned and past its time, today or yesterday, so a session missed last night
//   can be logged or skipped in the morning. Older ones are on Plan as missed.
// - Planned: the rest of today's, in time order.
// - Done: every practice logged today, planned or ad hoc.
// - Skipped: today's skipped and cancelled sessions, which never count as done. Those cancelled
//   by archiving their dog (D24) are left out: the dog isn't in the household's day any more.
//
// Care (S11) adds what's coming up.
import { addDays, todayIn, zonedDateTime, type PlainDate } from '../../domain/calendar.js';
import { ok, type Result } from '../../domain/result.js';
import type { ValidationError } from '../errors.js';
import type { Planner, PlannerContext, SessionView } from '../planner/planner.js';
import type { Ports } from '../ports/index.js';
import type { LogView, SessionLogs } from '../training-log/session-logs.js';

export interface TodayView {
	date: PlainDate;
	overdue: SessionView[];
	planned: SessionView[];
	done: LogView[];
	skipped: SessionView[];
}

export type Today = ReturnType<typeof createToday>;

export function createToday(
	{ clock }: Pick<Ports, 'clock'>,
	{ planner, sessionLogs }: { planner: Planner; sessionLogs: SessionLogs }
) {
	return {
		async read(ctx: PlannerContext): Promise<Result<TodayView, ValidationError>> {
			const now = clock.now();
			const date = todayIn(now, ctx.timeZone);
			// The planner's list also extends running series, so today's sessions exist.
			const [sessions, done] = await Promise.all([
				planner.list(ctx, { from: addDays(date, -1), to: date }),
				sessionLogs.listOn(ctx, date)
			]);
			if (!sessions.ok) return sessions;

			const view: TodayView = { date, overdue: [], planned: [], done, skipped: [] };
			for (const entry of sessions.value) {
				const { session } = entry;
				const past = session.scheduledAt < now;
				if (session.status === 'planned') {
					if (past) view.overdue.push(entry);
					else view.planned.push(entry);
				} else if (
					(session.status === 'skipped' || session.status === 'cancelled') &&
					!session.cancelledWithDog &&
					zonedDateTime(session.scheduledAt, ctx.timeZone).date === date
				) {
					view.skipped.push(entry);
				}
			}
			return ok(view);
		}
	};
}
