// The care calendar: /api/v1/care-tasks (architecture §5.2, D30, FR-10).
import { z } from 'zod';

/** What kind of care (ui.md J6). */
export const CareCategory = z.enum([
	'vaccination',
	'parasite_prevention',
	'vet_appointment',
	'puppy_school',
	'sterilisation_consult',
	'other'
]);
export type CareCategory = z.infer<typeof CareCategory>;

export const CareStatus = z.enum(['upcoming', 'completed', 'cancelled']);
export type CareStatus = z.infer<typeof CareStatus>;

/** A date on the household's clocks, and a time if the task has one. */
export const CareDue = z.object({ date: z.iso.date(), time: z.string().optional() });
export type CareDue = z.infer<typeof CareDue>;

/** One change in the task's history (FR-10), oldest first. */
export const CareHistoryEntry = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('created'), due: CareDue, at: z.iso.datetime(), by: z.string() }),
	z.object({
		kind: z.literal('rescheduled'),
		from: CareDue,
		due: CareDue,
		at: z.iso.datetime(),
		by: z.string()
	}),
	z.object({
		kind: z.literal('completed'),
		on: z.iso.date(),
		at: z.iso.datetime(),
		by: z.string()
	}),
	z.object({ kind: z.literal('cancelled'), at: z.iso.datetime(), by: z.string() }),
	z.object({ kind: z.literal('reopened'), at: z.iso.datetime(), by: z.string() })
]);
export type CareHistoryEntry = z.infer<typeof CareHistoryEntry>;

export const CareTask = z.object({
	id: z.string(),
	dogId: z.string(),
	category: CareCategory,
	title: z.string(),
	/** On the household's clocks. */
	dueDate: z.iso.date(),
	dueTime: z.string().optional(),
	status: CareStatus,
	/** Still upcoming on a day that's gone. */
	overdue: z.boolean(),
	completedOn: z.iso.date().optional(),
	/** Who marked it done, for History's "by Sam" (D35). */
	completedBy: z.string().optional(),
	/** The task planned on completing this one. */
	nextId: z.string().optional(),
	notes: z.string().optional(),
	/** On the task's own page only; `by` is a display name. */
	history: z.array(CareHistoryEntry).optional(),
	createdBy: z.string(),
	updatedAt: z.iso.datetime(),
	/** Who changed it last: "Alex changed this a moment ago" (ui.md §5.2). */
	updatedBy: z.string(),
	/** For If-Match. */
	etag: z.string()
});
export type CareTask = z.infer<typeof CareTask>;

/** The Care tab: every current dog's tasks. */
export const CareTasks = z.object({
	/** Soonest first, overdue ones included. */
	upcoming: z.array(CareTask),
	/** Completed and cancelled, latest due first; the last 100. */
	closed: z.array(CareTask)
});
export type CareTasks = z.infer<typeof CareTasks>;

const date = z.string().max(20);
const time = z.string().max(10);

/** Shape only; the backend checks the values. Null or left out leaves an optional detail unset. */
const details = {
	dogId: z.string().max(100).optional(),
	category: z.string().max(40).optional(),
	/** The category's name when blank. */
	title: z.string().max(1_000).nullish(),
	dueDate: date.optional(),
	dueTime: time.nullish(),
	notes: z.string().max(10_000).nullish()
};

/** The dog, category and date are required; the backend says so per field. */
export const CreateCareTask = z.strictObject(details);
export type CreateCareTask = z.infer<typeof CreateCareTask>;

/** A field left out stays as it was; null clears an optional one. */
export const UpdateCareTask = z.strictObject({
	...details,
	/** Cancel, or put back. Marking done is `POST …/complete`. */
	status: z.enum(['upcoming', 'cancelled']).optional()
});
export type UpdateCareTask = z.infer<typeof UpdateCareTask>;

export const CompleteCareTask = z.strictObject({
	/** Today if left out. */
	completedOn: date.optional(),
	/** Plan the next one: same dog, category and title. */
	next: z.strictObject({ dueDate: date, dueTime: time.nullish() }).optional()
});
export type CompleteCareTask = z.infer<typeof CompleteCareTask>;
