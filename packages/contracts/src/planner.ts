// The training planner: /api/v1/planned-sessions and /api/v1/training-plans (architecture §5.2,
// D24, FR-05).
import { z } from 'zod';

/** ISO weekday: Monday is 1, Sunday 7. */
export const Weekday = z.number().int().min(1).max(7);

export const SessionStatus = z.enum(['planned', 'completed', 'skipped', 'cancelled']);
export type SessionStatus = z.infer<typeof SessionStatus>;

/** The series a session belongs to, with its ETag for *This and following*. */
export const TrainingPlan = z.object({
	id: z.string(),
	exerciseId: z.string(),
	startDate: z.iso.date(),
	time: z.string(),
	/** Every day is daily; Monday to Friday is weekdays. */
	days: z.array(Weekday),
	/** The last date it can fall on. */
	until: z.iso.date().optional(),
	etag: z.string()
});
export type TrainingPlan = z.infer<typeof TrainingPlan>;

export const PlannedSession = z.object({
	id: z.string(),
	dogId: z.string(),
	exercise: z.object({
		id: z.string(),
		/** The exercise's ID when the library no longer has it. */
		title: z.string(),
		minutes: z.number().optional()
	}),
	scheduledAt: z.iso.datetime(),
	/** On the household's clocks. */
	date: z.iso.date(),
	time: z.string(),
	status: SessionStatus,
	plan: TrainingPlan.optional(),
	updatedAt: z.iso.datetime(),
	/** Who changed it last: "Alex changed this a moment ago" (ui.md §5.2). */
	updatedBy: z.string(),
	/** For If-Match. */
	etag: z.string()
});
export type PlannedSession = z.infer<typeof PlannedSession>;

/** Every dog's sessions in the range, in time order. */
export const PlannedSessions = z.object({ sessions: z.array(PlannedSession) });
export type PlannedSessions = z.infer<typeof PlannedSessions>;

const date = z.string().max(20);
const time = z.string().max(10);
const exerciseId = z.string().max(100);
const RepeatInput = z.strictObject({
	days: z.array(z.number().int()).max(7),
	until: date.optional()
});

/** Shape only; the backend checks the dates against the household's today. */
export const ScheduleSession = z.strictObject({
	dogId: z.string().max(100),
	exerciseId,
	date,
	time,
	/** Null or left out: once. */
	repeat: RepeatInput.nullish()
});
export type ScheduleSession = z.infer<typeof ScheduleSession>;

/** This session only. A field left out stays as it was. */
export const UpdatePlannedSession = z.strictObject({
	exerciseId: exerciseId.optional(),
	date: date.optional(),
	time: time.optional(),
	/** Completing is the quick log's. */
	status: z.enum(['planned', 'skipped', 'cancelled']).optional()
});
export type UpdatePlannedSession = z.infer<typeof UpdatePlannedSession>;

/** This session and the rest of its series. A field left out stays as it was. */
export const UpdateTrainingPlan = z.strictObject({
	fromSessionId: z.string().max(100),
	exerciseId: exerciseId.optional(),
	/** Where the changed series starts; the session's own date if left out. */
	date: date.optional(),
	time: time.optional(),
	repeat: RepeatInput.optional()
});
export type UpdateTrainingPlan = z.infer<typeof UpdateTrainingPlan>;

/** Cancels this session and the rest of its series. */
export const EndTrainingPlan = z.strictObject({ fromSessionId: z.string().max(100) });
export type EndTrainingPlan = z.infer<typeof EndTrainingPlan>;
