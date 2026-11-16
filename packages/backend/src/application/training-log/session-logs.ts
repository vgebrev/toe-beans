// The quick training log (architecture §5.2, D25, FR-07). Any member logs a practice with one of
// the household's dogs: against a planned session, which it completes in the same transaction,
// or ad hoc. The outcome defaults to not assessed and every other detail is optional, so a log
// never asks anyone to claim success. Editing carries the version it was based on (NFR-13).
// Deleting is a soft delete that can be undone until the purge (§5.3, FR-09); deleting a planned
// session's log puts the session back in the plan, and undoing it completes the session again.
import { addDays, startOfDay, type PlainDate } from '../../domain/calendar.js';
import { conflictError, validationError } from '../../domain/errors.js';
import type { Exercise } from '../../domain/exercise.js';
import { isId, type Id } from '../../domain/id.js';
import type { PlannedSession } from '../../domain/planner.js';
import { err, ok, type Result } from '../../domain/result.js';
import {
	cleanLogDetails,
	type LogDetails,
	type LogDetailsInput,
	type SessionLog
} from '../../domain/session-log.js';
import type { PlannerContext } from '../auth/auth.js';
import { CHOOSE_DOG, currentDog } from '../dogs/current-dog.js';
import {
	notFound,
	staleVersion,
	type ConflictError,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import { namesOf } from '../names.js';
import type { Ports } from '../ports/index.js';

/** A log with its exercise and the names of who practised and who changed it last. */
export interface LogView {
	log: SessionLog;
	/** Undefined only if the library no longer has it. */
	exercise: Exercise | undefined;
	caregiverName: string;
	updatedByName: string;
}

/** A planned session names its dog and exercise; an ad-hoc log names both. */
export interface LogRequest extends LogDetailsInput {
	plannedSessionId?: string | undefined;
	dogId?: string | undefined;
	exerciseId?: string | undefined;
}

type WriteFailure = NotFoundError | StaleVersionError;

export type SessionLogs = ReturnType<typeof createSessionLogs>;

export function createSessionLogs({
	sessionLogs: logs,
	plannedSessions: sessions,
	dogs,
	exercises,
	users,
	uow,
	clock,
	ids,
	logger
}: Pick<
	Ports,
	| 'sessionLogs'
	| 'plannedSessions'
	| 'dogs'
	| 'exercises'
	| 'users'
	| 'uow'
	| 'clock'
	| 'ids'
	| 'logger'
>) {
	const log = logger.child({ component: 'session-logs' });
	const invalid = (fields: Record<string, string[]>) =>
		err(validationError('The log is not valid.', fields));

	/** One lookup for every name the logs need. */
	async function views(entries: readonly SessionLog[]): Promise<LogView[]> {
		const name = await namesOf(
			users,
			entries.flatMap((e) => [e.caregiverId, e.updatedBy])
		);
		return entries.map((entry) => ({
			log: entry,
			exercise: exercises.get(entry.exerciseId),
			caregiverName: name(entry.caregiverId),
			updatedByName: name(entry.updatedBy)
		}));
	}
	const view = async (entry: SessionLog) => (await views([entry]))[0]!;

	const find = async (ctx: PlannerContext, id: string) =>
		isId(id) ? logs.findById(ctx.householdId, id) : null;

	/** Completes the session with the log. Call inside the transaction that inserts it. */
	async function complete(
		ctx: PlannerContext,
		sessionId: Id,
		build: (session: PlannedSession) => Promise<Result<SessionLog, ValidationError>>
	): Promise<Result<SessionLog, ValidationError | ConflictError | WriteFailure>> {
		const session = await sessions.findById(ctx.householdId, sessionId);
		if (!session) return err(notFound('session'));
		if (session.status === 'completed') {
			return err(conflictError('This session has already been logged.'));
		}
		if (session.status !== 'planned') {
			return err(
				conflictError(`This session was ${session.status}. Put it back in the plan to log it.`)
			);
		}
		const entry = await build(session);
		if (!entry.ok) return entry;
		const done = await sessions.update(ctx.householdId, session.id, session.version, {
			status: 'completed',
			sessionLogId: entry.value.id,
			updatedBy: ctx.userId
		});
		return done.ok ? entry : done;
	}

	return {
		/** Logs with their exercises and names, in one lookup (History, architecture §5.1). */
		views,

		/** Every dog's logs practised on `date` (the household's clocks), in time order. */
		async listOn(ctx: PlannerContext, date: PlainDate): Promise<LogView[]> {
			const found = await logs.listPractisedBetween(
				ctx.householdId,
				startOfDay(date, ctx.timeZone),
				startOfDay(addDays(date, 1), ctx.timeZone)
			);
			return views(found);
		},

		async get(ctx: PlannerContext, id: string): Promise<Result<LogView, NotFoundError>> {
			const entry = await find(ctx, id);
			return entry ? ok(await view(entry)) : err(notFound('log'));
		},

		/**
		 * Logs a practice. With `plannedSessionId` the dog and exercise are the session's, and the
		 * session becomes completed in the same transaction (§5.2); a session that's been logged,
		 * skipped or cancelled meanwhile is a conflict.
		 */
		async create(
			ctx: PlannerContext,
			input: LogRequest
		): Promise<Result<LogView, ValidationError | ConflictError | WriteFailure>> {
			const now = clock.now();
			const defaults: LogDetails = { practisedAt: now, outcome: 'not_assessed' };
			const details = cleanLogDetails(input, defaults, now);
			const fields: Record<string, string[]> = details.ok ? {} : { ...details.error.fields };

			const build = async (
				dogId: Id,
				exercise: Exercise,
				plannedSessionId?: Id
			): Promise<Result<SessionLog, ValidationError>> => {
				if (!details.ok || Object.keys(fields).length > 0) return invalid(fields);
				return ok(
					await logs.insert({
						id: ids.next(),
						householdId: ctx.householdId,
						dogId,
						exerciseId: exercise.id,
						exerciseContentVersion: exercise.contentVersion,
						...(plannedSessionId && { plannedSessionId }),
						caregiverId: ctx.userId,
						updatedBy: ctx.userId,
						...details.value
					})
				);
			};

			let created: Result<SessionLog, ValidationError | ConflictError | WriteFailure>;
			if (input.plannedSessionId !== undefined) {
				const sessionId = input.plannedSessionId;
				if (!isId(sessionId)) return err(notFound('session'));
				created = await uow.run(() =>
					complete(ctx, sessionId, async (session) => {
						const exercise = exercises.get(session.exerciseId);
						if (!exercise) fields.exerciseId = ['This exercise is no longer in the library.'];
						if (input.dogId !== undefined && input.dogId !== session.dogId) {
							fields.dogId = ["This isn't the planned session's dog."];
						}
						if (input.exerciseId !== undefined && input.exerciseId !== session.exerciseId) {
							fields.exerciseId = ["This isn't the planned session's exercise."];
						}
						if (!exercise) return invalid(fields);
						return build(session.dogId, exercise, session.id);
					})
				);
			} else {
				const { dogId, exerciseId } = input;
				const dog = await currentDog(dogs, ctx.householdId, dogId);
				if (!dog) fields.dogId = [CHOOSE_DOG];
				const exercise = exerciseId === undefined ? undefined : exercises.get(exerciseId);
				if (!exercise) fields.exerciseId = ['Choose an exercise from the library.'];
				if (!dog || !exercise) return invalid(fields);
				created = await build(dog.id, exercise);
			}
			if (!created.ok) return created;
			log.info('practice logged', {
				householdId: ctx.householdId,
				logId: created.value.id,
				planned: created.value.plannedSessionId !== undefined
			});
			return ok(await view(created.value));
		},

		/** Changes the outcome, when or the context. The dog, exercise and session stay. */
		async update(
			ctx: PlannerContext,
			input: { id: string; expectedVersion: number; changes: LogDetailsInput }
		): Promise<Result<LogView, ValidationError | WriteFailure>> {
			const entry = await find(ctx, input.id);
			if (!entry) return err(notFound('log'));
			if (entry.version !== input.expectedVersion) return err(staleVersion);
			const details = cleanLogDetails(input.changes, entry, clock.now());
			if (!details.ok) return details;
			const next = details.value;
			const updated = await logs.update(ctx.householdId, entry.id, input.expectedVersion, {
				practisedAt: next.practisedAt,
				outcome: next.outcome,
				durationMin: next.durationMin,
				emotionalState: next.emotionalState,
				environment: next.environment,
				environmentNote: next.environmentNote,
				notes: next.notes,
				updatedBy: ctx.userId
			});
			if (!updated.ok) return updated;
			log.info('log changed', { householdId: ctx.householdId, logId: entry.id });
			return ok(await view(updated.value));
		},

		/**
		 * Soft-deletes the log (§5.3). A planned session it completed goes back to planned, so it
		 * can be logged again, or to cancelled with its dog if the dog has been archived (D24). The
		 * result carries the version `restore` needs.
		 */
		async remove(
			ctx: PlannerContext,
			input: { id: string; expectedVersion: number }
		): Promise<Result<SessionLog, WriteFailure>> {
			const removed = await uow.run(async (): Promise<Result<SessionLog, WriteFailure>> => {
				const entry = await find(ctx, input.id);
				if (!entry) return err(notFound('log'));
				if (entry.version !== input.expectedVersion) return err(staleVersion);
				if (entry.plannedSessionId) {
					const session = await sessions.findById(ctx.householdId, entry.plannedSessionId);
					if (session?.status === 'completed' && session.sessionLogId === entry.id) {
						const dog = await dogs.findById(ctx.householdId, session.dogId);
						const reopened = await sessions.update(ctx.householdId, session.id, session.version, {
							...(dog?.archivedAt
								? { status: 'cancelled', cancelledWithDog: true }
								: { status: 'planned' }),
							sessionLogId: undefined,
							updatedBy: ctx.userId
						});
						if (!reopened.ok) return reopened;
					}
				}
				return logs.softDelete(ctx.householdId, entry.id, entry.version, ctx.userId);
			});
			if (removed.ok) {
				log.info('log deleted', {
					householdId: ctx.householdId,
					logId: removed.value.id,
					planned: removed.value.plannedSessionId !== undefined
				});
			}
			return removed;
		},

		/**
		 * Brings a deleted log back: the snackbar's *Undo* (ui.md J8). Its planned session is
		 * completed again; if the session has been logged, skipped or cancelled meanwhile, or has
		 * gone from the plan, nothing comes back (409).
		 */
		async restore(
			ctx: PlannerContext,
			input: { id: string; expectedVersion: number }
		): Promise<Result<LogView, ConflictError | WriteFailure>> {
			if (!isId(input.id)) return err(notFound('log'));
			const id = input.id;
			const restored = await uow.run(
				async (): Promise<Result<SessionLog, ConflictError | WriteFailure>> => {
					const entry = await logs.findDeleted(ctx.householdId, id);
					if (!entry) return err(notFound('log'));
					if (entry.version !== input.expectedVersion) return err(staleVersion);
					if (entry.plannedSessionId) {
						const session = await sessions.findById(ctx.householdId, entry.plannedSessionId);
						const reopened =
							session?.status === 'planned' ||
							(session?.status === 'cancelled' && session.cancelledWithDog);
						if (!session || !reopened) {
							return err(
								conflictError(
									!session
										? "Its session is no longer in the plan, so the log can't come back."
										: session.status === 'completed'
											? "Its session has been logged again, so this log can't come back."
											: `Its session was ${session.status} meanwhile, so the log can't come back.`
								)
							);
						}
						const done = await sessions.update(ctx.householdId, session.id, session.version, {
							status: 'completed',
							cancelledWithDog: undefined,
							sessionLogId: entry.id,
							updatedBy: ctx.userId
						});
						if (!done.ok) return done;
					}
					return logs.restore(ctx.householdId, entry.id, entry.version, ctx.userId);
				}
			);
			if (!restored.ok) return restored;
			log.info('log restored', { householdId: ctx.householdId, logId: id });
			return ok(await view(restored.value));
		}
	};
}
