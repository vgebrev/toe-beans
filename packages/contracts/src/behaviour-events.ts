// The behaviour journal: /api/v1/behaviour-events (architecture §5.2, D28, FR-08).
import { z } from 'zod';

/** What happened (ui.md J5). */
export const EventCategory = z.enum([
	'barking',
	'cat_interaction',
	'fear',
	'toileting_accident',
	'visitor',
	'other'
]);
export type EventCategory = z.infer<typeof EventCategory>;

export const BehaviourEvent = z.object({
	id: z.string(),
	dogId: z.string(),
	category: EventCategory,
	occurredAt: z.iso.datetime(),
	/** On the household's clocks. */
	date: z.iso.date(),
	time: z.string(),
	trigger: z.string().optional(),
	/** How the puppy responded. */
	response: z.string().optional(),
	notes: z.string().optional(),
	/** Who recorded it. */
	recordedBy: z.string(),
	updatedAt: z.iso.datetime(),
	/** Who changed it last: "Alex changed this a moment ago" (ui.md §5.2). */
	updatedBy: z.string(),
	/** For If-Match. */
	etag: z.string()
});
export type BehaviourEvent = z.infer<typeof BehaviourEvent>;

/** Shape only; the backend checks the values. Null or left out leaves an optional detail unset. */
const details = {
	dogId: z.string().max(100).optional(),
	category: z.string().max(40).optional(),
	/** Defaults to now. */
	occurredAt: z.string().max(40).optional(),
	trigger: z.string().max(1_000).nullish(),
	response: z.string().max(5_000).nullish(),
	notes: z.string().max(10_000).nullish()
};

/** The dog and the category are required; the backend says so per field. */
export const CreateBehaviourEvent = z.strictObject(details);
export type CreateBehaviourEvent = z.infer<typeof CreateBehaviourEvent>;

/** A field left out stays as it was; null clears an optional one. */
export const UpdateBehaviourEvent = z.strictObject(details);
export type UpdateBehaviourEvent = z.infer<typeof UpdateBehaviourEvent>;
