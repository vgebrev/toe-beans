// The exercise library (FR-03): read-only for everyone signed in. Content isn't household data,
// so the only check is the session, which the host makes.
import type { Exercise } from '../../domain/exercise.js';
import { err, ok, type Result } from '../../domain/result.js';
import { notFound, type NotFoundError } from '../errors.js';
import type { Ports } from '../ports/index.js';

export interface Exercises {
	list(): readonly Exercise[];
	get(id: string): Result<Exercise, NotFoundError>;
}

export function createExercises({ exercises }: Pick<Ports, 'exercises'>): Exercises {
	return {
		list: () => exercises.all(),
		get(id) {
			const exercise = exercises.get(id);
			return exercise ? ok(exercise) : err(notFound('exercise'));
		}
	};
}
