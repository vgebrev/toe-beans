// The exercise library, loaded once at startup (architecture §5.2). Read-only: it's content, not
// household data, so there's nothing to isolate and no version to check.
import type { Exercise } from '../../domain/exercise.js';

export interface ExerciseCatalogue {
	/** In library order (`sortExercises`). */
	all(): readonly Exercise[];
	get(id: string): Exercise | undefined;
}
