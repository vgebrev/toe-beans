// The exercise library: /api/v1/exercises (architecture §3.8, §5.2, FR-03). Read-only content.
import { z } from 'zod';

/** FR-03's skill areas, in library order. The backend's domain holds the same list. */
export const SkillArea = z.enum([
	'name-recognition',
	'recall',
	'toileting',
	'greetings',
	'settling',
	'doorbell',
	'barking',
	'loose-leash',
	'cats'
]);
export type SkillArea = z.infer<typeof SkillArea>;

export const ExerciseSource = z.object({
	title: z.string(),
	url: z.string(),
	kind: z.enum(['article', 'video'])
});
export type ExerciseSource = z.infer<typeof ExerciseSource>;

/** What a library card shows (ui.md §4.6). */
export const ExerciseSummary = z.object({
	id: z.string(),
	title: z.string(),
	skillArea: SkillArea,
	goal: z.string(),
	suggestedDurationMin: z.number().int(),
	/** Not yet reviewed. Only ever true on a local or test server; prod refuses to start with drafts. */
	draft: z.boolean()
});
export type ExerciseSummary = z.infer<typeof ExerciseSummary>;

/** In library order. */
export const Exercises = z.object({ exercises: z.array(ExerciseSummary) });
export type Exercises = z.infer<typeof Exercises>;

/** Text fields are plain text: paragraphs separated by a blank line, no other line breaks. */
export const Exercise = ExerciseSummary.extend({
	contentVersion: z.number().int(),
	setup: z.string(),
	steps: z.array(z.string()),
	successCriteria: z.string(),
	ifStruggling: z.string(),
	safetyNotes: z.string().optional(),
	sources: z.array(ExerciseSource)
});
export type Exercise = z.infer<typeof Exercise>;
