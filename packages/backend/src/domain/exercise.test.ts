import { describe, expect, it } from 'vitest';
import {
	flaggedTerms,
	libraryProblems,
	SKILL_AREAS,
	sortExercises,
	type Exercise
} from './exercise.js';

const exercise = (overrides: Partial<Exercise> = {}): Exercise => ({
	id: 'recall-basics',
	contentVersion: 1,
	title: 'Recall basics',
	skillArea: 'recall',
	goal: 'Comes when called.',
	setup: 'A quiet room.',
	steps: ['Call once.', 'Reward at your feet.'],
	suggestedDurationMin: 5,
	successCriteria: 'Comes straight away.',
	ifStruggling: 'Get closer.',
	sources: [{ title: 'Recall', url: 'https://example.org/recall', kind: 'article' }],
	review: { by: 'Owner', at: '2026-11-09' },
	reviewedTerms: [],
	...overrides
});

/** A copy without the given optional fields. */
const without = <T extends object, K extends keyof T>(o: T, ...keys: K[]): Omit<T, K> => {
	const copy = { ...o };
	for (const key of keys) delete copy[key];
	return copy;
};

/** One reviewed exercise per skill area: a library that may ship. */
const fullLibrary = () =>
	SKILL_AREAS.map((skillArea) => exercise({ id: `ex-${skillArea}`, skillArea }));

describe('flaggedTerms', () => {
	it('finds aversive vocabulary in any text field, whatever the case or form', () => {
		const found = flaggedTerms(
			exercise({
				steps: ['Never PUNISHED for this.'],
				ifStruggling: 'A leash pop or a spray bottle is never needed. No alpha rolls.',
				safetyNotes: 'Dominance theory is outdated.'
			})
		);
		expect(found).toEqual([
			{ term: 'punish', field: 'steps[0]' },
			{ term: 'alpha', field: 'ifStruggling' },
			{ term: 'leash pop', field: 'ifStruggling' },
			{ term: 'spray bottle', field: 'ifStruggling' },
			{ term: 'dominance', field: 'safetyNotes' }
		]);
	});

	it('matches whole words, so innocent words that contain a term pass', () => {
		expect(
			flaggedTerms(
				exercise({ goal: 'Alphabet, shitzu-free, whitepaper, correctly-ish? Uncorrected.' })
			)
		).toEqual([]);
	});
});

describe('libraryProblems', () => {
	it('passes a reviewed library covering every skill area', () => {
		expect(libraryProblems(fullLibrary())).toEqual([]);
	});

	it('refuses an exercise nobody has reviewed', () => {
		const [first, ...rest] = fullLibrary();
		const draft = without(first!, 'review');
		expect(libraryProblems([draft, ...rest])).toEqual([
			'ex-name-recognition: not reviewed yet (set reviewedBy and reviewedAt)'
		]);
	});

	it('refuses a flagged term until the reviewer acknowledges it', () => {
		const [first, ...rest] = fullLibrary();
		const flagged = { ...first!, goal: 'Not a correction.' };
		expect(libraryProblems([flagged, ...rest])).toEqual([
			'ex-name-recognition: "correct" in goal may describe an aversive method; reword it, or list it in reviewedTerms once checked'
		]);
		expect(libraryProblems([{ ...flagged, reviewedTerms: ['correct'] }, ...rest])).toEqual([]);
	});

	it('refuses acknowledgements that are unknown or no longer needed', () => {
		const [first, ...rest] = fullLibrary();
		expect(libraryProblems([{ ...first!, reviewedTerms: ['punish', 'treats'] }, ...rest])).toEqual([
			'ex-name-recognition: reviewedTerms lists "punish", which no longer appears',
			'ex-name-recognition: reviewedTerms lists "treats", which isn\'t a flagged term'
		]);
	});

	it('names each skill area with no exercise (FR-03)', () => {
		const library = fullLibrary().filter((e) => e.skillArea !== 'cats' && e.skillArea !== 'recall');
		expect(libraryProblems(library)).toEqual([
			'no exercise covers the "recall" skill area (FR-03)',
			'no exercise covers the "cats" skill area (FR-03)'
		]);
	});
});

describe('sortExercises', () => {
	it('orders by skill area, keeping file order within one', () => {
		const sorted = sortExercises([
			exercise({ id: 'cats-1', skillArea: 'cats' }),
			exercise({ id: 'recall-2' }),
			exercise({ id: 'recall-1' }),
			exercise({ id: 'name-1', skillArea: 'name-recognition' })
		]);
		expect(sorted.map((e) => e.id)).toEqual(['name-1', 'recall-2', 'recall-1', 'cats-1']);
	});
});
