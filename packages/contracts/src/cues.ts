// The household's shared cue dictionary: /api/v1/cues (architecture §5.2, FR-04).
import { z } from 'zod';

export const Cue = z.object({
	id: z.string(),
	/** The spoken word or phrase. */
	label: z.string(),
	meaning: z.string(),
	handSignal: z.string().optional(),
	rewardConvention: z.string().optional(),
	notes: z.string().optional(),
	/** When it was last saved, and by whom: "Last edited by Sam, 2 days ago" (ui.md §4.6). */
	updatedAt: z.iso.datetime(),
	updatedBy: z.string(),
	/** For If-Match. */
	etag: z.string()
});
export type Cue = z.infer<typeof Cue>;

/** In alphabetical order of the cue word. */
export const Cues = z.object({ cues: z.array(Cue) });
export type Cues = z.infer<typeof Cues>;

/** Shape only; the backend tidies and checks the meaning. */
export const CreateCue = z.strictObject({
	label: z.string().max(500),
	meaning: z.string().max(5_000),
	handSignal: z.string().max(5_000).nullish(),
	rewardConvention: z.string().max(5_000).nullish(),
	notes: z.string().max(10_000).nullish()
});
export type CreateCue = z.infer<typeof CreateCue>;

/** A field left out stays as it was; null clears an optional one. */
export const UpdateCue = CreateCue.partial();
export type UpdateCue = z.infer<typeof UpdateCue>;
