// The History read model (architecture §5.1, FR-08, FR-09, D29, D35): the household's session
// logs, behaviour events and completed care tasks in one timeline, newest first, a page at a time.
// No aggregate of its own: it reads the three repositories and merges them.
//
// Filters: a dog; a type (training, events, one event category, care, or one care category); an exercise, which
// leaves only training; and dates on the household's clocks, inclusive. Each source is asked for
// one more than a page after the cursor, so the merged page is right and says whether more follow.
// Soft-deleted entries are never listed (§5.3).
//
// A care task is done on a day, not at a time, so it heads its day like an all-day item in a
// calendar: it sorts at the day's last millisecond on the household's clocks (D35).
import { EVENT_CATEGORIES, type EventCategory } from '../../domain/behaviour-event.js';
import { CARE_CATEGORIES, type CareCategory } from '../../domain/care-task.js';
import {
	addDays,
	instantAt,
	isPlainDate,
	todayIn,
	type PlainDate,
	type PlainTime
} from '../../domain/calendar.js';
import { isId, type Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import { validationError, type ValidationError } from '../errors.js';
import type { CareTasks, CareView } from '../care/care-tasks.js';
import type { BehaviourEvents, EventView } from '../journal/behaviour-events.js';
import type { PlannerContext } from '../planner/planner.js';
import type { Ports, TimelineCursor, TimelineQuery } from '../ports/index.js';
import type { LogView, SessionLogs } from '../training-log/session-logs.js';

export const HISTORY_PAGE_SIZE = 30;

/** One kind of care is `care-` and its category, as an event category could share its name. */
const CARE_TYPES = CARE_CATEGORIES.map((c) => `care-${c}` as const);

export const HISTORY_TYPES = [
	'training',
	'events',
	...EVENT_CATEGORIES,
	'care',
	...CARE_TYPES
] as const;

/** What the page asks for; every field is optional and comes from the URL. */
export interface HistoryFilter {
	dogId?: string | undefined;
	/** `training`, `events`, an event category, `care` or `care-` and a care category. */
	type?: string | undefined;
	exerciseId?: string | undefined;
	/** A date on the household's clocks, inclusive. */
	from?: string | undefined;
	/** A date on the household's clocks, inclusive. */
	to?: string | undefined;
	/** From the page before's `next`. */
	cursor?: string | undefined;
}

export type HistoryEntry =
	| { kind: 'training'; view: LogView }
	| { kind: 'event'; view: EventView }
	| { kind: 'care'; view: CareView };

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

/** Where a care task done on `date` sorts: the last millisecond of that day, heading it. */
export const careAt = (date: PlainDate, timeZone: string) =>
	new Date(instantAt(addDays(date, 1), MIDNIGHT, timeZone).getTime() - 1);

/** The cursor in the care source's terms: earlier days, and its own day if it's a care entry's. */
function careBefore({ at, id }: TimelineCursor, timeZone: string) {
	const date = todayIn(at, timeZone);
	return careAt(date, timeZone).getTime() === at.getTime() ? { date, id } : { date };
}

interface Placed {
	entry: HistoryEntry;
	at: Date;
	id: Id;
}

/** Newest first, then by ID, as each source orders its own. */
const newestFirst = (a: Placed, b: Placed) =>
	b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1);

export type History = ReturnType<typeof createHistory>;

export function createHistory(
	{
		sessionLogs: logs,
		behaviourEvents: events,
		careTasks: tasks
	}: Pick<Ports, 'sessionLogs' | 'behaviourEvents' | 'careTasks'>,
	{
		sessionLogs,
		behaviourEvents,
		careTasks
	}: {
		sessionLogs: Pick<SessionLogs, 'views'>;
		behaviourEvents: Pick<BehaviourEvents, 'views'>;
		careTasks: Pick<CareTasks, 'views'>;
	}
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
				fields.type = ['Choose training, events, care, or one kind of event or care.'];
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
			const careCategory = type?.startsWith('care-')
				? (type.slice('care-'.length) as CareCategory)
				: undefined;
			const isCare = type === 'care' || careCategory !== undefined;
			const wantsEvents = exerciseId === undefined && type !== 'training' && !isCare;
			const wantsCare = exerciseId === undefined && (type === undefined || isCare);
			const category = EVENT_CATEGORIES.includes(type as EventCategory)
				? (type as EventCategory)
				: undefined;

			const [logPage, eventPage, carePage] = await Promise.all([
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
					: [],
				wantsCare
					? tasks.listCompletedTimeline(ctx.householdId, {
							...(dogId !== undefined && { dogId: dogId as Id }),
							...(careCategory && { categories: [careCategory] }),
							...(from !== undefined && { from: from as PlainDate }),
							...(to !== undefined && { to: to as PlainDate }),
							...(before && { before: careBefore(before, ctx.timeZone) }),
							limit: limit + 1
						})
					: []
			]);
			const [logViews, eventViews, careViews] = await Promise.all([
				sessionLogs.views(logPage),
				behaviourEvents.views(eventPage),
				careTasks.views(carePage)
			]);
			const merged: Placed[] = [
				...logViews.map((view) => ({
					entry: { kind: 'training', view } as const,
					at: view.log.practisedAt,
					id: view.log.id
				})),
				...eventViews.map((view) => ({
					entry: { kind: 'event', view } as const,
					at: view.event.occurredAt,
					id: view.event.id
				})),
				...careViews.map((view) => ({
					entry: { kind: 'care', view } as const,
					at: careAt(view.task.completedOn!, ctx.timeZone),
					id: view.task.id
				}))
			].sort(newestFirst);

			const page = merged.slice(0, limit);
			const last = page.at(-1);
			return ok({
				entries: page.map((p) => p.entry),
				...(merged.length > limit && last && { next: encodeCursor(last) })
			});
		}
	};
}
