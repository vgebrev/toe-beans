// /api/v1/exercises (architecture §3.8, §5.2): the read-only library. The host checks there's a
// session; the content isn't household data, so there's nothing more to check.
import type {
	Exercise as ExerciseDto,
	Exercises as ExercisesDto,
	ExerciseSummary
} from '@toe-beans/contracts';
import type { Exercises } from '../application/exercises/exercises.js';
import type { Exercise } from '../domain/exercise.js';
import { json, respond, type HttpResponse } from './response.js';

export interface ExercisesHttp {
	list(): HttpResponse;
	get(input: { id: string }): HttpResponse;
}

const summaryDto = (e: Exercise): ExerciseSummary => ({
	id: e.id,
	title: e.title,
	skillArea: e.skillArea,
	goal: e.goal,
	suggestedDurationMin: e.suggestedDurationMin,
	draft: !e.review
});

export const exerciseDto = (e: Exercise): ExerciseDto => ({
	...summaryDto(e),
	contentVersion: e.contentVersion,
	setup: e.setup,
	steps: [...e.steps],
	successCriteria: e.successCriteria,
	ifStruggling: e.ifStruggling,
	...(e.safetyNotes && { safetyNotes: e.safetyNotes }),
	sources: e.sources.map((s) => ({ ...s }))
});

export function createExercisesHttp(exercises: Exercises): ExercisesHttp {
	return {
		list: () => json({ exercises: exercises.list().map(summaryDto) } satisfies ExercisesDto),
		get: ({ id }) => respond(exercises.get(id), (e) => json(exerciseDto(e)))
	};
}
