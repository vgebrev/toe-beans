// The training planner (architecture §5.2, D24, FR-05). Any member can schedule a session for one
// of the household's dogs, once or on a weekly pattern, then move, skip or cancel one session, or
// change or end a series from a session on (*This and following*). Every change carries the
// version it was based on, so a change made elsewhere is never silently overwritten (NFR-13).
//
// A series materialises its sessions over a rolling horizon. Reading a week extends it, so the
// weeks people look at always exist; the reminder tick extends it too, so reminders do.
import {
	addDays,
	daysBetween,
	instantAt,
	isPlainDate,
	maxDate,
	todayIn,
	zonedDateTime,
	type PlainDate,
	type PlainTime
} from '../../domain/calendar.js';
import { conflictError, validationError } from '../../domain/errors.js';
import type { Exercise } from '../../domain/exercise.js';
import { isId, type Id } from '../../domain/id.js';
import {
	checkSchedule,
	HORIZON_DAYS,
	MAX_AHEAD_DAYS,
	MAX_RANGE_DAYS,
	occurrenceDates,
	PLANS_MAX,
	type PlannedSession,
	type Schedule,
	type ScheduleInput,
	type SettableStatus,
	type TrainingPlan
} from '../../domain/planner.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { SessionLog } from '../../domain/session-log.js';
import type { MemberContext } from '../auth/auth.js';
import { FORMER_MEMBER } from '../cues/cues.js';
import {
	notFound,
	staleVersion,
	type ConflictError,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import type { NewPlannedSession, Ports } from '../ports/index.js';

/** Planning happens on the household's clocks, so the use cases need its time zone. */
export type PlannerContext = MemberContext & { timeZone: string };

/** A household and its clocks, for work nobody in particular asked for (the reminder tick). */
export type HouseholdClock = Pick<PlannerContext, 'householdId' | 'timeZone'>;

/** A session with its series, its exercise and who changed it last. */
export interface SessionView {
	session: PlannedSession;
	plan: TrainingPlan | null;
	/** Undefined only if the library no longer has it. */
	exercise: Exercise | undefined;
	/** The log that completed it, for its outcome. */
	log: SessionLog | null;
	updatedByName: string;
}

export interface ScheduleRequest extends ScheduleInput {
	dogId: string;
	exerciseId: string;
}

/** This session only. A missing field stays as it was. */
export interface SessionChanges {
	exerciseId?: string | undefined;
	date?: string | undefined;
	time?: string | undefined;
	status?: SettableStatus | undefined;
}

/** This session and the rest of its series. A missing field stays as it was. */
export interface SeriesChanges {
	exerciseId?: string | undefined;
	/** Where the changed series starts: the session's own date unless moved. */
	date?: string | undefined;
	time?: string | undefined;
	repeat?: { days: number[]; until?: string | undefined } | undefined;
}

type Invalid = ValidationError;
const MIDNIGHT = '00:00' as PlainTime;
type WriteFailure = NotFoundError | StaleVersionError;

export type Planner = ReturnType<typeof createPlanner>;

export function createPlanner({
	plans,
	plannedSessions: sessions,
	sessionLogs,
	dogs,
	exercises,
	users,
	uow,
	clock,
	ids,
	logger
}: Pick<
	Ports,
	| 'plans'
	| 'plannedSessions'
	| 'sessionLogs'
	| 'dogs'
	| 'exercises'
	| 'users'
	| 'uow'
	| 'clock'
	| 'ids'
	| 'logger'
>) {
	const log = logger.child({ component: 'planner' });
	const today = (ctx: HouseholdClock) => todayIn(clock.now(), ctx.timeZone);
	const invalid = (fields: Record<string, string[]>, message = 'The session is not valid.') =>
		err(validationError(message, fields));

	async function views(ctx: PlannerContext, list: PlannedSession[]): Promise<SessionView[]> {
		const planIds = [...new Set(list.flatMap((s) => (s.planId ? [s.planId] : [])))];
		const logIds = list.flatMap((s) => (s.sessionLogId ? [s.sessionLogId] : []));
		const [planList, logList, people] = await Promise.all([
			planIds.length > 0 ? plans.findByIds(ctx.householdId, planIds) : [],
			logIds.length > 0 ? sessionLogs.findByIds(ctx.householdId, logIds) : [],
			users.findByIds([...new Set(list.map((s) => s.updatedBy))])
		]);
		const byId = new Map(planList.map((p) => [p.id, p]));
		const logsById = new Map(logList.map((l) => [l.id, l]));
		const names = new Map(people.map((u) => [u.id, u.displayName]));
		return list.map((session) => ({
			session,
			plan: (session.planId && byId.get(session.planId)) || null,
			exercise: exercises.get(session.exerciseId),
			log: (session.sessionLogId && logsById.get(session.sessionLogId)) || null,
			updatedByName: names.get(session.updatedBy) ?? FORMER_MEMBER
		}));
	}
	const view = async (ctx: PlannerContext, s: PlannedSession) => (await views(ctx, [s]))[0]!;

	const findSession = async (ctx: PlannerContext, id: string) =>
		isId(id) ? sessions.findById(ctx.householdId, id) : null;
	const findPlan = async (ctx: PlannerContext, id: string) =>
		isId(id) ? plans.findById(ctx.householdId, id) : null;

	/** Field errors for a dog that isn't one of the household's current dogs, or an unknown exercise. */
	async function checkSubjects(
		ctx: PlannerContext,
		{ dogId, exerciseId }: { dogId?: string | undefined; exerciseId?: string | undefined }
	): Promise<Record<string, string[]>> {
		const fields: Record<string, string[]> = {};
		if (dogId !== undefined) {
			const dog = isId(dogId) ? await dogs.findById(ctx.householdId, dogId) : null;
			if (!dog || dog.archivedAt) fields.dogId = ['Choose one of your dogs.'];
		}
		if (exerciseId !== undefined && !exercises.get(exerciseId)) {
			fields.exerciseId = ['Choose an exercise from the library.'];
		}
		return fields;
	}

	const occurrence = (
		plan: TrainingPlan,
		date: PlainDate,
		timeZone: string
	): NewPlannedSession => ({
		id: ids.next(),
		householdId: plan.householdId,
		dogId: plan.dogId,
		exerciseId: plan.exerciseId,
		scheduledAt: instantAt(date, plan.time, timeZone),
		status: 'planned',
		planId: plan.id,
		occurrenceKey: date,
		updatedBy: plan.updatedBy
	});

	/** Adds the series' sessions after its horizon, up to `through`. Call inside a transaction. */
	async function materialise(plan: TrainingPlan, through: PlainDate, timeZone: string) {
		if (plan.horizon >= through) return;
		const dates = occurrenceDates(plan, addDays(plan.horizon, 1), through);
		await sessions.insertOccurrences(
			plan.householdId,
			dates.map((d) => occurrence(plan, d, timeZone))
		);
		await plans.advanceHorizon(plan.householdId, plan.id, plan.horizon, through);
	}

	/**
	 * Makes sure every running series has its sessions up to `through`. Each series is its own
	 * transaction that re-reads it, so one changed meanwhile (and a concurrent extension, which
	 * moves the same horizon) makes it retry rather than add sessions to a series that has ended.
	 */
	async function extend(ctx: HouseholdClock, through: PlainDate) {
		const running = await plans.listRunning(ctx.householdId, today(ctx));
		for (const stale of running.filter((p) => p.horizon < through && !p.paused)) {
			await uow.run(async () => {
				const plan = await plans.findById(ctx.householdId, stale.id);
				if (plan && !plan.paused) await materialise(plan, through, ctx.timeZone);
				return ok(undefined);
			});
		}
	}

	/** Inserts a series and its first sessions, and returns the first. Call inside a transaction. */
	async function startSeries(
		ctx: PlannerContext,
		{ dogId, exerciseId }: { dogId: Id; exerciseId: string },
		schedule: Schedule & { repeat: NonNullable<Schedule['repeat']> }
	): Promise<Result<PlannedSession, Invalid>> {
		const plan = await plans.insert({
			id: ids.next(),
			householdId: ctx.householdId,
			dogId,
			exerciseId,
			startDate: schedule.date,
			time: schedule.time,
			days: schedule.repeat.days,
			...(schedule.repeat.until && { until: schedule.repeat.until }),
			horizon: addDays(schedule.date, -1),
			updatedBy: ctx.userId
		});
		// At least a week from the start, so the first session exists whatever the days.
		const through = maxDate(addDays(today(ctx), HORIZON_DAYS), addDays(schedule.date, 6));
		await materialise(plan, through, ctx.timeZone);
		const [first] = await sessions.listFrom(ctx.householdId, plan.id, schedule.date);
		if (!first) {
			return invalid({
				'repeat.until': ['None of the chosen days falls before the end date.']
			});
		}
		return ok(first);
	}

	return {
		/**
		 * The household's sessions on the dates from `from` to `to` (inclusive, on its clocks), every
		 * dog's, in time order. Skipped and cancelled ones are included; the UI groups them.
		 */
		async list(
			ctx: PlannerContext,
			input: { from: string; to: string }
		): Promise<Result<SessionView[], Invalid>> {
			const { from, to } = input;
			if (!isPlainDate(from) || !isPlainDate(to) || to < from) {
				return invalid({ from: ['Give a date range.'] }, 'The range is not valid.');
			}
			if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
				return invalid(
					{ to: [`List up to ${MAX_RANGE_DAYS} days at a time.`] },
					'The range is not valid.'
				);
			}
			const now = today(ctx);
			if (to > addDays(now, MAX_AHEAD_DAYS)) {
				return invalid({ to: ['Plans go up to a year ahead.'] }, 'The range is not valid.');
			}
			await extend(ctx, maxDate(to, addDays(now, HORIZON_DAYS)));
			const found = await sessions.listBetween(
				ctx.householdId,
				instantAt(from, MIDNIGHT, ctx.timeZone),
				instantAt(addDays(to, 1), MIDNIGHT, ctx.timeZone)
			);
			return ok(await views(ctx, found));
		},

		async get(ctx: PlannerContext, id: string): Promise<Result<SessionView, NotFoundError>> {
			const session = await findSession(ctx, id);
			return session ? ok(await view(ctx, session)) : err(notFound('session'));
		},

		/** One session, or the first of a new series. */
		async schedule(
			ctx: PlannerContext,
			input: ScheduleRequest
		): Promise<Result<SessionView, Invalid>> {
			const checked = checkSchedule(input, today(ctx));
			const fields = {
				...(await checkSubjects(ctx, input)),
				...(checked.ok ? {} : checked.fields)
			};
			if (!checked.ok || Object.keys(fields).length > 0) return invalid(fields);
			const schedule = checked.value;
			const dogId = input.dogId as Id;
			const { exerciseId } = input;

			if (!schedule.repeat) {
				const session = await sessions.insert({
					id: ids.next(),
					householdId: ctx.householdId,
					dogId,
					exerciseId,
					scheduledAt: instantAt(schedule.date, schedule.time, ctx.timeZone),
					status: 'planned',
					updatedBy: ctx.userId
				});
				log.info('session planned', { householdId: ctx.householdId, sessionId: session.id });
				return ok(await view(ctx, session));
			}

			const running = await plans.listRunning(ctx.householdId, today(ctx));
			if (running.length >= PLANS_MAX) {
				return err(
					validationError(
						`A household can have up to ${PLANS_MAX} repeating plans. End one to add another.`
					)
				);
			}
			const repeat = schedule.repeat;
			const first = await uow.run(() =>
				startSeries(ctx, { dogId, exerciseId }, { ...schedule, repeat })
			);
			if (!first.ok) return first;
			log.info('series planned', { householdId: ctx.householdId, planId: first.value.planId });
			return ok(await view(ctx, first.value));
		},

		/** Moves, skips, cancels or brings back this session only, or changes its exercise. */
		async update(
			ctx: PlannerContext,
			input: { id: string; expectedVersion: number; changes: SessionChanges }
		): Promise<Result<SessionView, Invalid | ConflictError | WriteFailure>> {
			const session = await findSession(ctx, input.id);
			if (!session) return err(notFound('session'));
			if (session.version !== input.expectedVersion) return err(staleVersion);
			if (session.status === 'completed') {
				return err(conflictError("This session has been logged, so it can't be changed."));
			}
			const { exerciseId, date, time, status } = input.changes;
			const fields = await checkSubjects(ctx, { exerciseId });
			let scheduledAt: Date | undefined;
			if (date !== undefined || time !== undefined) {
				const current = zonedDateTime(session.scheduledAt, ctx.timeZone);
				const checked = checkSchedule(
					{ date: date ?? current.date, time: time ?? current.time },
					today(ctx)
				);
				if (!checked.ok) Object.assign(fields, checked.fields);
				else scheduledAt = instantAt(checked.value.date, checked.value.time, ctx.timeZone);
			}
			if (Object.keys(fields).length > 0) return invalid(fields);

			const updated = await sessions.update(ctx.householdId, session.id, input.expectedVersion, {
				...(exerciseId !== undefined && { exerciseId }),
				...(scheduledAt && { scheduledAt }),
				...(status !== undefined && { status, cancelledWithDog: undefined }),
				updatedBy: ctx.userId
			});
			if (!updated.ok) return updated;
			log.info('session changed', {
				householdId: ctx.householdId,
				sessionId: session.id,
				status: updated.value.status
			});
			return ok(await view(ctx, updated.value));
		},

		/**
		 * *This and following*: the series ends the day before `fromSessionId`'s date, its unlogged
		 * sessions from then on go, and a new series with the changes starts in their place. Returns
		 * the new series' first session.
		 */
		async updateSeries(
			ctx: PlannerContext,
			input: {
				planId: string;
				expectedVersion: number;
				fromSessionId: string;
				changes: SeriesChanges;
			}
		): Promise<Result<SessionView, Invalid | WriteFailure>> {
			const plan = await findPlan(ctx, input.planId);
			const from = await findSession(ctx, input.fromSessionId);
			if (!plan) return err(notFound('plan'));
			if (!from || from.planId !== plan.id || !from.occurrenceKey) return err(notFound('session'));
			const fromKey = from.occurrenceKey;
			const { changes } = input;
			const repeat = changes.repeat ?? {
				days: plan.days,
				...(plan.until && { until: plan.until })
			};
			const checked = checkSchedule(
				{ date: changes.date ?? fromKey, time: changes.time ?? plan.time, repeat },
				today(ctx)
			);
			const exerciseId = changes.exerciseId ?? plan.exerciseId;
			const fields = {
				...(await checkSubjects(ctx, { exerciseId: changes.exerciseId })),
				...(checked.ok ? {} : checked.fields)
			};
			if (!checked.ok || Object.keys(fields).length > 0) return invalid(fields);
			const schedule = { ...checked.value, repeat: checked.value.repeat! };

			const first = await uow.run<PlannedSession, Invalid | WriteFailure>(async () => {
				const ended = await plans.update(ctx.householdId, plan.id, input.expectedVersion, {
					until: addDays(fromKey, -1),
					updatedBy: ctx.userId
				});
				if (!ended.ok) return ended;
				await sessions.deleteUnloggedFrom(ctx.householdId, plan.id, fromKey);
				return startSeries(ctx, { dogId: plan.dogId, exerciseId }, schedule);
			});
			if (!first.ok) return first;
			log.info('series changed', {
				householdId: ctx.householdId,
				planId: plan.id,
				newPlanId: first.value.planId
			});
			return ok(await view(ctx, first.value));
		},

		/** *Cancel this and following*: the series ends before this session, whose unlogged ones go. */
		async endSeries(
			ctx: PlannerContext,
			input: { planId: string; expectedVersion: number; fromSessionId: string }
		): Promise<Result<void, WriteFailure>> {
			const plan = await findPlan(ctx, input.planId);
			const from = await findSession(ctx, input.fromSessionId);
			if (!plan) return err(notFound('plan'));
			if (!from || from.planId !== plan.id || !from.occurrenceKey) return err(notFound('session'));
			const fromKey = from.occurrenceKey;
			const ended = await uow.run<void, WriteFailure>(async () => {
				const updated = await plans.update(ctx.householdId, plan.id, input.expectedVersion, {
					until: addDays(fromKey, -1),
					updatedBy: ctx.userId
				});
				if (!updated.ok) return updated;
				await sessions.deleteUnloggedFrom(ctx.householdId, plan.id, fromKey);
				return ok(undefined);
			});
			if (ended.ok) log.info('series ended', { householdId: ctx.householdId, planId: plan.id });
			return ended;
		},

		/**
		 * When a dog is archived (D24): its series pause and every session of its still planned is
		 * cancelled, past ones too, so nothing of it stays due. Call inside the archive's transaction.
		 */
		async dogArchived(ctx: PlannerContext, dogId: Id): Promise<Result<void, WriteFailure>> {
			const running = await plans.listRunning(ctx.householdId, today(ctx));
			for (const plan of running.filter((p) => p.dogId === dogId && !p.paused)) {
				const paused = await plans.update(ctx.householdId, plan.id, plan.version, {
					paused: true,
					updatedBy: ctx.userId
				});
				if (!paused.ok) return paused;
			}
			const cancelled = await sessions.cancelPlannedFor(ctx.householdId, dogId, ctx.userId);
			log.info('dog sessions cancelled', { householdId: ctx.householdId, dogId, cancelled });
			return ok(undefined);
		},

		/**
		 * When the dog is brought back: what archiving cancelled is planned again if it's still
		 * ahead, and its series go on from today. A session cancelled by hand stays cancelled, and
		 * the dates the dog was away get no sessions. Call inside the transaction that brings it back.
		 */
		async dogRestored(ctx: PlannerContext, dogId: Id): Promise<Result<void, WriteFailure>> {
			const now = today(ctx);
			const running = await plans.listRunning(ctx.householdId, now);
			const through = addDays(now, HORIZON_DAYS);
			for (const plan of running.filter((p) => p.dogId === dogId && p.paused)) {
				const resumed = await plans.update(ctx.householdId, plan.id, plan.version, {
					paused: undefined,
					updatedBy: ctx.userId
				});
				if (!resumed.ok) return resumed;
				// Skip the days it was away rather than fill them with missed sessions.
				const yesterday = addDays(now, -1);
				let horizon = resumed.value.horizon;
				if (horizon < yesterday) {
					await plans.advanceHorizon(ctx.householdId, plan.id, horizon, yesterday);
					horizon = yesterday;
				}
				await materialise({ ...resumed.value, horizon }, through, ctx.timeZone);
			}
			const restored = await sessions.restoreFor(ctx.householdId, dogId, clock.now(), ctx.userId);
			log.info('dog sessions restored', { householdId: ctx.householdId, dogId, restored });
			return ok(undefined);
		},

		/** For the reminder tick: every running series' sessions up to the horizon. */
		extendHorizon: (ctx: HouseholdClock) => extend(ctx, addDays(today(ctx), HORIZON_DAYS))
	};
}
