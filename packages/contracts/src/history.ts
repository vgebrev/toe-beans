// History: /api/v1/history (architecture §5.1, FR-08, FR-09, D35), session logs, behaviour events
// and completed care tasks in one timeline, newest first, a page at a time.
import { z } from 'zod';
import { BehaviourEvent, EventCategory } from './behaviour-events.js';
import { CareCategory, CareTask } from './care-tasks.js';
import { SessionLog } from './session-logs.js';

/**
 * What History can show: `training`, `events`, one event category, `care`, or `care-` and a care
 * category (`care-vaccination`), as an event category could share a care category's name. The
 * backend's application holds the same list.
 */
export const historyTypes = [
	'training',
	'events',
	...EventCategory.options,
	'care',
	...CareCategory.options.map((c) => `care-${c}` as const)
] as const;
export type HistoryType = (typeof historyTypes)[number];

export const HistoryEntry = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('training'), log: SessionLog }),
	z.object({ kind: z.literal('event'), event: BehaviourEvent }),
	/** Completed, heading the day it was done (`completedOn`). */
	z.object({ kind: z.literal('care'), task: CareTask })
]);
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export const HistoryPage = z.object({
	entries: z.array(HistoryEntry),
	/** Pass as `cursor` for the next page; absent on the last. */
	next: z.string().optional()
});
export type HistoryPage = z.infer<typeof HistoryPage>;

/**
 * The query string, every parameter optional: `dog`, `type` (one of `historyTypes`), `exercise`
 * (training only), `from` and `to` (dates on the household's clocks, inclusive) and `cursor`.
 */
export const HistoryQuery = z.object({
	dog: z.string().max(100).optional(),
	type: z.string().max(40).optional(),
	exercise: z.string().max(100).optional(),
	from: z.string().max(20).optional(),
	to: z.string().max(20).optional(),
	cursor: z.string().max(200).optional()
});
export type HistoryQuery = z.infer<typeof HistoryQuery>;
