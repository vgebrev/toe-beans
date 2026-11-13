// The History read model (architecture §5.1, FR-08, FR-09): the household's session logs and
// behaviour events in one timeline, newest first, a page at a time. No aggregate of its own: it
// reads both repositories and merges them.
//
// Filters: a dog; a type (training, events, or one event category); an exercise, which leaves
// only training; and dates on the household's clocks, inclusive. Each source is asked for one
// more than a page after the cursor, so the merged page is right and says whether more follow.
// Soft-deleted entries are never listed (§5.3).
import { EVENT_CATEGORIES, type EventCategory } from '../../domain/behaviour-event.js';
import { addDays, instantAt, isPlainDate, type PlainTime } from '../../domain/calendar.js';
import { isId, type Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import { validationError, type ValidationError } from '../errors.js';
import type { BehaviourEvents, EventView } from '../journal/behaviour-events.js';
import type { PlannerContext } from '../planner/planner.js';
import type { Ports, TimelineCursor, TimelineQuery } from '../ports/index.js';
import type { LogView, SessionLogs } from '../training-log/session-logs.js';

export const HISTORY_PAGE_SIZE = 30;

export const HISTORY_TYPES = ['training', 'events', ...EVENT_CATEGORIES] as const;

/** What the page asks for; every field is optional and comes from the URL. */
export interface HistoryFilter {
	dogId?: string | undefined;
	/** `training`, `events` or an event category. */
	type?: string | undefined;
	exerciseId?: string | undefined;
	/** A date on the household's clocks, inclusive. */
	from?: string | undefined;
	/** A date on the household's clocks, inclusive. */
	to?: string | undefined;
	/** From the page before's `next`. */
	cursor?: string | undefined;
}

export type HistoryEntry = { kind: 'training'; view: LogView } | { kind: 'event'; view: EventView };

export interface HistoryPage {
	entries: HistoryEntry[];
	/** The cursor for the next page, when there is one. */
	next?: string;
}

const MIDNIGHT = '00:00' as PlainTime;

/** Opaque to the client: when the last entry happened, in milliseconds, and its ID. */
export const encodeCursor = ({ at, id }: TimelineCursor) => `${at.getTime()}.${id}`;

export function decodeCursor(cursor: string): TimelineCursor | null {
	const match = /^(\d{1,15})\.(.+)$/.exec(cursor);
	if (!match || !isId(match[2]!)) return null;
	return { at: new Date(Number(match[1])), id: match[2] as Id };
}

const atOf = (entry: HistoryEntry) =>
	entry.kind === 'training' ? entry.view.log.practisedAt : entry.view.event.occurredAt;
const idOf = (entry: HistoryEntry) =>
	entry.kind === 'training' ? entry.view.log.id : entry.view.event.id;

/** Newest first, then by ID, as each source orders its own. */
const newestFirst = (a: HistoryEntry, b: HistoryEntry) =>
	atOf(b).getTime() - atOf(a).getTime() || (idOf(a) < idOf(b) ? 1 : -1);

export type History = ReturnType<typeof createHistory>;

export function createHistory(
	{ sessionLogs: logs, behaviourEvents: events }: Pick<Ports, 'sessionLogs' | 'behaviourEvents'>,
	{
		sessionLogs,
		behaviourEvents
	}: { sessionLogs: Pick<SessionLogs, 'views'>; behaviourEvents: Pick<BehaviourEvents, 'views'> }
) {
	return {
		async list(
			ctx: PlannerContext,
			filter: HistoryFilter,
			limit = HISTORY_PAGE_SIZE
		): Promise<Result<HistoryPage, ValidationError>> {
			const fields: Record<string, string[]> = {};
			const { dogId, type, exerciseId, from, to, cursor } = filter;
			if (dogId !== undefined && !isId(dogId)) fields.dog = ['Choose one of your dogs.'];
			if (type !== undefined && !(HISTORY_TYPES as readonly string[]).includes(type)) {
				fields.type = ['Choose training, events or one kind of event.'];
			}
			if (from !== undefined && !isPlainDate(from)) fields.from = ['Choose a start date.'];
			if (to !== undefined && !isPlainDate(to)) fields.to = ['Choose an end date.'];
			else if (from !== undefined && to !== undefined && isPlainDate(from) && to < from) {
				fields.to = ['Choose an end date on or after the start.'];
			}
			const before = cursor === undefined ? undefined : decodeCursor(cursor);
			if (before === null) fields.cursor = ['Start again from the top.'];
			if (Object.keys(fields).length > 0) {
				return err(validationError('The history filter is not valid.', fields));
			}

			const query: TimelineQuery = {
				...(dogId !== undefined && { dogId: dogId as Id }),
				...(from !== undefined &&
					isPlainDate(from) && { from: instantAt(from, MIDNIGHT, ctx.timeZone) }),
				...(to !== undefined &&
					isPlainDate(to) && { to: instantAt(addDays(to, 1), MIDNIGHT, ctx.timeZone) }),
				...(before && { before }),
				limit: limit + 1
			};
			const wantsTraining = type === undefined || type === 'training';
			const wantsEvents = exerciseId === undefined && type !== 'training';
			const category = EVENT_CATEGORIES.includes(type as EventCategory)
				? (type as EventCategory)
				: undefined;

			const [logPage, eventPage] = await Promise.all([
				wantsTraining
					? logs.listTimeline(ctx.householdId, {
							...query,
							...(exerciseId !== undefined && { exerciseId })
						})
					: [],
				wantsEvents
					? events.listTimeline(ctx.householdId, {
							...query,
							...(category && { categories: [category] })
						})
					: []
			]);
			const [logViews, eventViews] = await Promise.all([
				sessionLogs.views(logPage),
				behaviourEvents.views(eventPage)
			]);
			const merged = [
				...logViews.map((view) => ({ kind: 'training', view }) as const),
				...eventViews.map((view) => ({ kind: 'event', view }) as const)
			].sort(newestFirst);

			const entries = merged.slice(0, limit);
			const last = entries.at(-1);
			return ok({
				entries,
				...(merged.length > limit &&
					last && { next: encodeCursor({ at: atOf(last), id: idOf(last) as Id }) })
			});
		}
	};
}
