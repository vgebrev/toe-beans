// The quick training log (architecture §5.2, D25, FR-07). Any member logs a practice with one of
// the household's dogs: against a planned session, which it completes in the same transaction,
// or ad hoc. The outcome defaults to not assessed and every other detail is optional, so a log
// never asks anyone to claim success. Editing carries the version it was based on (NFR-13).
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
import { FORMER_MEMBER } from '../cues/cues.js';
import {
	notFound,
	staleVersion,
	type ConflictError,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import type { PlannerContext } from '../planner/planner.js';
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

	async function view(entry: SessionLog): Promise<LogView> {
		const people = await users.findByIds([...new Set([entry.caregiverId, entry.updatedBy])]);
		const names = new Map(people.map((u) => [u.id, u.displayName]));
		return {
			log: entry,
			exercise: exercises.get(entry.exerciseId),
			caregiverName: names.get(entry.caregiverId) ?? FORMER_MEMBER,
			updatedByName: names.get(entry.updatedBy) ?? FORMER_MEMBER
		};
	}

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
				const dog =
					dogId !== undefined && isId(dogId) ? await dogs.findById(ctx.householdId, dogId) : null;
				if (!dog || dog.archivedAt) fields.dogId = ['Choose one of your dogs.'];
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
		}
	};
}
