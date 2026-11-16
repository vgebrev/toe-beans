// The care calendar (architecture §5.2, D30, FR-10, scenarios 5 and 7). Any member adds a care
// task for one of the household's dogs, changes it, completes it on a given day, perhaps planning
// the next one at the same time, cancels it or puts it back. Every change of status or date goes
// into the task's history, so nothing is lost (FR-10). Edits carry the version they were based on
// (NFR-13). Reminders aren't wired in here: the tick works them out from the tasks (D27), so a
// moved, completed or cancelled task needs no reminder code.
//
// While a dog is archived its tasks stay as they are, but drop out of the Care list, Today and
// reminders; they come back with the dog (D30).
import { addDays, todayIn, type PlainDate } from '../../domain/calendar.js';
import {
	changesFrom,
	checkCompletedOn,
	cleanCareDetails,
	COMING_UP_DAYS,
	dueOf,
	withChange,
	type CareDetailsInput,
	type CareHistoryEntry,
	type CareTask
} from '../../domain/care-task.js';
import { conflictError, validationError, type ConflictError } from '../../domain/errors.js';
import { isId, type Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { PlannerContext } from '../auth/auth.js';
import { CHOOSE_DOG, currentDog } from '../dogs/current-dog.js';
import {
	notFound,
	staleVersion,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import { namesOf } from '../names.js';
import type { Ports } from '../ports/index.js';

/** A task with the names of everyone its page mentions. */
export interface CareView {
	task: CareTask;
	/** User ID to display name, for `updatedBy`, `createdBy` and the history. */
	names: Record<Id, string>;
}

/** The dog and the details; dog, category and date are required for a new task. */
export interface CareRequest extends CareDetailsInput {
	dogId?: string | undefined;
}

export interface CareUpdate extends CareRequest {
	/** Cancelling, or putting a completed or cancelled task back. Completing is `complete`. */
	status?: 'upcoming' | 'cancelled' | undefined;
}

export interface CareCompletion {
	/** Today if left out. */
	completedOn?: string | undefined;
	/** "Plan the next one": the same dog, category and title, due then. */
	next?: { dueDate: string; dueTime?: string | null | undefined } | undefined;
}

export interface CareList {
	/** Soonest first, overdue ones included. */
	upcoming: CareView[];
	/** Completed and cancelled, latest due first. */
	closed: CareView[];
}

/** The Care tab lists this many past tasks: a few years of a household's care. */
export const CLOSED_LIMIT = 100;

export type CareTasks = ReturnType<typeof createCareTasks>;

type WriteFailure = ValidationError | NotFoundError | StaleVersionError | ConflictError;

export function createCareTasks({
	careTasks: tasks,
	dogs,
	users,
	uow,
	clock,
	ids,
	logger
}: Pick<Ports, 'careTasks' | 'dogs' | 'users' | 'uow' | 'clock' | 'ids' | 'logger'>) {
	const log = logger.child({ component: 'care-tasks' });
	const chooseDog = { dogId: [CHOOSE_DOG] };

	/** One lookup for every name the tasks need. */
	async function views(entries: readonly CareTask[]): Promise<CareView[]> {
		if (entries.length === 0) return [];
		const wanted = new Set<Id>();
		for (const t of entries) {
			wanted.add(t.createdBy).add(t.updatedBy);
			for (const h of t.history) wanted.add(h.by);
		}
		const name = await namesOf(users, wanted);
		const names = Object.fromEntries([...wanted].map((id) => [id, name(id)]));
		return entries.map((task) => ({ task, names }));
	}
	const view = async (task: CareTask) => (await views([task]))[0]!;

	/** IDs of the household's dogs that aren't archived. */
	async function currentDogIds(ctx: PlannerContext): Promise<Set<Id>> {
		return new Set(
			(await dogs.list(ctx.householdId)).filter((d) => !d.archivedAt).map((d) => d.id)
		);
	}

	const find = async (ctx: PlannerContext, id: string) =>
		isId(id) ? tasks.findById(ctx.householdId, id) : null;

	const entry = (ctx: PlannerContext, at: Date) => ({ at, by: ctx.userId });

	const invalid = (details: Result<unknown, ValidationError>, dogOk: boolean) =>
		err(
			validationError('The care task is not valid.', {
				...(details.ok ? {} : details.error.fields),
				...(!dogOk && chooseDog)
			})
		);

	return {
		/** Tasks with their names, for History's care entries (D35). */
		views,

		/** The Care tab: current dogs' tasks, upcoming and past. */
		async list(ctx: PlannerContext): Promise<CareList> {
			const [upcoming, closed, current] = await Promise.all([
				tasks.listUpcoming(ctx.householdId),
				tasks.listClosed(ctx.householdId, CLOSED_LIMIT),
				currentDogIds(ctx)
			]);
			const mine = (list: CareTask[]) => list.filter((t) => current.has(t.dogId));
			const [up, past] = await Promise.all([views(mine(upcoming)), views(mine(closed))]);
			return { upcoming: up, closed: past };
		},

		/** Today's *Coming up*: upcoming tasks due within a week, and any overdue (D30). */
		async comingUp(ctx: PlannerContext, today: PlainDate): Promise<CareView[]> {
			const [upcoming, current] = await Promise.all([
				tasks.listUpcoming(ctx.householdId, { until: addDays(today, COMING_UP_DAYS) }),
				currentDogIds(ctx)
			]);
			return views(upcoming.filter((t) => current.has(t.dogId)));
		},

		async get(ctx: PlannerContext, id: string): Promise<Result<CareView, NotFoundError>> {
			const task = await find(ctx, id);
			return task ? ok(await view(task)) : err(notFound('care task'));
		},

		async create(
			ctx: PlannerContext,
			input: CareRequest
		): Promise<Result<CareView, ValidationError>> {
			const now = clock.now();
			const details = cleanCareDetails(input, {}, todayIn(now, ctx.timeZone));
			const dogId = (await currentDog(dogs, ctx.householdId, input.dogId))?.id;
			if (!details.ok || !dogId) return invalid(details, !!dogId);
			const task = await tasks.insert({
				id: ids.next(),
				householdId: ctx.householdId,
				dogId,
				...details.value,
				status: 'upcoming',
				history: [{ kind: 'created', due: dueOf(details.value), ...entry(ctx, now) }],
				createdBy: ctx.userId,
				updatedBy: ctx.userId
			});
			log.info('care task added', {
				householdId: ctx.householdId,
				careTaskId: task.id,
				category: task.category
			});
			return ok(await view(task));
		},

		/**
		 * Changes the details, the date (a reschedule in the history) or the dog (to another current
		 * dog); cancels the task, or puts it back as upcoming, keeping its history.
		 */
		async update(
			ctx: PlannerContext,
			input: { id: string; expectedVersion: number; changes: CareUpdate }
		): Promise<Result<CareView, WriteFailure>> {
			const task = await find(ctx, input.id);
			if (!task) return err(notFound('care task'));
			if (task.version !== input.expectedVersion) return err(staleVersion);
			const now = clock.now();
			const { status, ...changes } = input.changes;
			const details = cleanCareDetails(changes, task, todayIn(now, ctx.timeZone));
			const wanted = changes.dogId;
			const dogId =
				wanted === undefined || wanted === task.dogId
					? task.dogId
					: (await currentDog(dogs, ctx.householdId, wanted))?.id;
			if (!details.ok || !dogId) return invalid(details, !!dogId);
			if (status === 'cancelled' && task.status === 'completed') {
				return err(conflictError("This task is done, so it can't be cancelled."));
			}

			const next = details.value;
			const nextStatus = status ?? task.status;
			const history = changesFrom(task, { ...next, status: nextStatus }).reduce<CareHistoryEntry[]>(
				(all, change) => withChange(all, { ...change, ...entry(ctx, now) }),
				task.history
			);
			const reopened = nextStatus === 'upcoming' && task.status === 'completed';
			const updated = await tasks.update(ctx.householdId, task.id, input.expectedVersion, {
				...(dogId !== task.dogId && { dogId }),
				category: next.category,
				title: next.title,
				dueDate: next.dueDate,
				dueTime: next.dueTime,
				notes: next.notes,
				...(nextStatus !== task.status && { status: nextStatus }),
				...(reopened && { completedOn: undefined }),
				...(history.length !== task.history.length && { history }),
				updatedBy: ctx.userId
			});
			if (!updated.ok) return updated;
			log.info('care task changed', {
				householdId: ctx.householdId,
				careTaskId: task.id,
				status: nextStatus
			});
			return ok(await view(updated.value));
		},

		/**
		 * Marks an upcoming task done on `completedOn` (today by default) and, with `next`, adds the
		 * next one for the same dog, category and title, in one transaction (D30). The result is the
		 * completed task, whose `nextId` names the new one.
		 */
		async complete(
			ctx: PlannerContext,
			input: { id: string; expectedVersion: number } & CareCompletion
		): Promise<Result<CareView, WriteFailure>> {
			const task = await find(ctx, input.id);
			if (!task) return err(notFound('care task'));
			if (task.version !== input.expectedVersion) return err(staleVersion);
			if (task.status !== 'upcoming') {
				return err(
					conflictError(
						task.status === 'completed' ? 'This task is already done.' : 'This task was cancelled.'
					)
				);
			}
			const now = clock.now();
			const today = todayIn(now, ctx.timeZone);
			const completedOn = checkCompletedOn(input.completedOn, today);
			if (!completedOn.ok) return completedOn;

			let following: Parameters<typeof tasks.insert>[0] | undefined;
			if (input.next) {
				const details = cleanCareDetails(
					{ dueDate: input.next.dueDate, dueTime: input.next.dueTime ?? null },
					{ category: task.category, title: task.title },
					today
				);
				if (!details.ok) {
					return err(validationError('The next task is not valid.', prefixed(details.error)));
				}
				if (details.value.dueDate <= completedOn.value) {
					return err(
						validationError('The next task is not valid.', {
							'next.dueDate': ['Choose a date after the day it was done.']
						})
					);
				}
				following = {
					id: ids.next(),
					householdId: ctx.householdId,
					dogId: task.dogId,
					...details.value,
					status: 'upcoming',
					history: [{ kind: 'created', due: dueOf(details.value), ...entry(ctx, now) }],
					createdBy: ctx.userId,
					updatedBy: ctx.userId
				};
			}

			const done = await uow.run(async (): Promise<Result<CareTask, WriteFailure>> => {
				if (following) await tasks.insert(following);
				return tasks.update(ctx.householdId, task.id, input.expectedVersion, {
					status: 'completed',
					completedOn: completedOn.value,
					...(following && { nextId: following.id }),
					history: withChange(task.history, {
						kind: 'completed',
						on: completedOn.value,
						...entry(ctx, now)
					}),
					updatedBy: ctx.userId
				});
			});
			if (!done.ok) return done;
			log.info('care task completed', {
				householdId: ctx.householdId,
				careTaskId: task.id,
				...(following && { nextCareTaskId: following.id })
			});
			return ok(await view(done.value));
		}
	};
}

/** The next task's field errors, under `next.` so the sheet can place them. */
function prefixed(error: ValidationError): Record<string, string[]> {
	return Object.fromEntries(
		Object.entries(error.fields ?? {}).map(([key, messages]) => [`next.${key}`, messages])
	);
}
