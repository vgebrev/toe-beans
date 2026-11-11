// The Today read model: /api/v1/today (architecture §5.1, D26, FR-06).
import { z } from 'zod';
import { PlannedSession } from './planner.js';
import { SessionLog } from './session-logs.js';

/** Every dog's day on the household's clocks; the UI filters by dog. Each list in time order. */
export const Today = z.object({
	/** Today on the household's clocks. */
	date: z.iso.date(),
	/** Still planned and past their time, today or yesterday. */
	overdue: z.array(PlannedSession),
	/** The rest of today's planned sessions. */
	planned: z.array(PlannedSession),
	/** Every practice logged today, planned or ad hoc. */
	done: z.array(SessionLog),
	/** Today's skipped and cancelled sessions, which never count as done. */
	skipped: z.array(PlannedSession)
});
export type Today = z.infer<typeof Today>;
