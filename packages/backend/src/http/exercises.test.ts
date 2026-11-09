import { describe, expect, it } from 'vitest';
import { createExercises } from '../application/exercises/exercises.js';
import type { Exercise } from '../domain/exercise.js';
import { createExercisesHttp } from './exercises.js';

const base: Exercise = {
	id: 'recall-basics',
	contentVersion: 2,
	title: 'Recall basics',
	skillArea: 'recall',
	goal: 'Comes when called.',
	setup: 'A quiet room.',
	steps: ['Call once.'],
	suggestedDurationMin: 5,
	successCriteria: 'Comes straight away.',
	ifStruggling: 'Get closer.',
	safetyNotes: 'Use a long line outdoors.',
	sources: [{ title: 'Recall', url: 'https://example.org/recall', kind: 'video' }],
	review: { by: 'Owner', at: '2026-11-09' },
	reviewedTerms: []
};
/** A copy without the given optional fields. */
const without = <T extends object, K extends keyof T>(o: T, ...keys: K[]): Omit<T, K> => {
	const copy = { ...o };
	for (const key of keys) delete copy[key];
	return copy;
};
const draft: Exercise = {
	...without(base, 'review', 'safetyNotes'),
	id: 'name-game',
	skillArea: 'name-recognition'
};

const http = createExercisesHttp(
	createExercises({
		exercises: {
			all: () => [draft, base],
			get: (id) => [draft, base].find((e) => e.id === id)
		}
	})
);

describe('exercises http', () => {
	it('lists summaries, marking drafts, without review details', () => {
		const res = http.list();
		expect(res.status).toBe(200);
		expect(res.headers['cache-control']).toBe('no-store');
		expect(res.body).toEqual({
			exercises: [
				{
					id: 'name-game',
					title: 'Recall basics',
					skillArea: 'name-recognition',
					goal: 'Comes when called.',
					suggestedDurationMin: 5,
					draft: true
				},
				expect.objectContaining({ id: 'recall-basics', draft: false })
			]
		});
	});

	it('gets one exercise in full', () => {
		const res = http.get({ id: 'recall-basics' });
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			contentVersion: 2,
			steps: ['Call once.'],
			safetyNotes: 'Use a long line outdoors.',
			sources: [{ kind: 'video' }],
			draft: false
		});
		expect(res.body).not.toHaveProperty('reviewedTerms');
		expect(http.get({ id: 'name-game' }).body).not.toHaveProperty('safetyNotes');
	});

	it('is a 404 problem for an unknown id', () => {
		const res = http.get({ id: 'nope' });
		expect(res.status).toBe(404);
		expect(res.headers['content-type']).toBe('application/problem+json');
	});
});
