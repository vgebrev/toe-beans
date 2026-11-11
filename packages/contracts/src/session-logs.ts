// The quick training log: /api/v1/session-logs (architecture §5.2, D25, FR-07).
import { z } from 'zod';

/** How it went. Not assessed is the default, and never counts as successful (FR-07). */
export const Outcome = z.enum(['successful', 'partial', 'not_yet', 'not_assessed']);
export type Outcome = z.infer<typeof Outcome>;

export const EmotionalState = z.enum(['relaxed', 'uncertain', 'stressed']);
export type EmotionalState = z.infer<typeof EmotionalState>;

export const Environment = z.enum(['home', 'garden', 'public', 'other']);
export type Environment = z.infer<typeof Environment>;

export const SessionLog = z.object({
	id: z.string(),
	dogId: z.string(),
	exercise: z.object({
		id: z.string(),
		/** The exercise's ID when the library no longer has it. */
		title: z.string(),
		minutes: z.number().optional()
	}),
	/** The planned session it completed, if any. */
	plannedSessionId: z.string().optional(),
	practisedAt: z.iso.datetime(),
	/** On the household's clocks. */
	date: z.iso.date(),
	time: z.string(),
	outcome: Outcome,
	durationMin: z.number().int().optional(),
	emotionalState: EmotionalState.optional(),
	environment: Environment.optional(),
	environmentNote: z.string().optional(),
	notes: z.string().optional(),
	/** Who practised. */
	caregiver: z.string(),
	updatedAt: z.iso.datetime(),
	/** Who changed it last: "Alex changed this a moment ago" (ui.md §5.2). */
	updatedBy: z.string(),
	/** For If-Match. */
	etag: z.string()
});
export type SessionLog = z.infer<typeof SessionLog>;

/** Shape only; the backend checks the values. Null or left out leaves an optional detail unset. */
const details = {
	/** Defaults to now. */
	practisedAt: z.string().max(40).optional(),
	/** Defaults to not assessed. */
	outcome: z.string().max(20).optional(),
	durationMin: z.number().nullish(),
	emotionalState: z.string().max(20).nullish(),
	environment: z.string().max(20).nullish(),
	environmentNote: z.string().max(1_000).nullish(),
	notes: z.string().max(10_000).nullish()
};

/** A planned session names its dog and exercise; an ad-hoc log names both. */
export const CreateSessionLog = z.strictObject({
	plannedSessionId: z.string().max(100).optional(),
	dogId: z.string().max(100).optional(),
	exerciseId: z.string().max(100).optional(),
	...details
});
export type CreateSessionLog = z.infer<typeof CreateSessionLog>;

/** A field left out stays as it was; null clears an optional one. */
export const UpdateSessionLog = z.strictObject(details);
export type UpdateSessionLog = z.infer<typeof UpdateSessionLog>;
