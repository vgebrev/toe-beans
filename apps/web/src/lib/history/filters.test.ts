import { describe, expect, it } from 'vitest';
import { filterQuery, presetOf, readFilters, withFilters } from './filters.js';

const none = { type: null, exercise: null, from: null, to: null };

describe('history filters', () => {
	it('reads the URL, dropping what isn’t a filter', () => {
		expect(
			readFilters(new URLSearchParams('type=fear&exercise=sit&from=2026-11-01&to=2026-11-10&x=1'))
		).toEqual({ type: 'fear', exercise: 'sit', from: '2026-11-01', to: '2026-11-10' });
		expect(readFilters(new URLSearchParams('type=care'))).toEqual({ ...none, type: 'care' });
		expect(readFilters(new URLSearchParams('type=care-other'))).toEqual({
			...none,
			type: 'care-other'
		});
		expect(readFilters(new URLSearchParams('type=care-walks'))).toEqual(none);
		expect(readFilters(new URLSearchParams('type=walks&from=2026-13-01'))).toEqual(none);
		expect(readFilters(new URLSearchParams('from=2026-11-10&to=2026-11-01'))).toEqual(none);
	});

	it('writes them back in a stable order', () => {
		expect(filterQuery(none)).toBe('');
		expect(filterQuery({ ...none, to: '2026-11-10', type: 'training' }, { cursor: 'c' })).toBe(
			'type=training&to=2026-11-10&cursor=c'
		);
	});

	it('keeps an exercise only with training', () => {
		expect(withFilters({ ...none, type: 'fear' }, { exercise: 'sit' })).toEqual({
			...none,
			exercise: 'sit'
		});
		expect(withFilters({ ...none, type: 'care' }, { exercise: 'sit' })).toEqual({
			...none,
			exercise: 'sit'
		});
		expect(withFilters({ ...none, exercise: 'sit' }, { type: 'events' })).toEqual({
			...none,
			type: 'events'
		});
		expect(withFilters({ ...none, exercise: 'sit' }, { type: 'training' })).toEqual({
			...none,
			type: 'training',
			exercise: 'sit'
		});
	});

	it('names the date preset', () => {
		const today = '2026-11-13';
		expect(presetOf(none, today)).toBe('all');
		expect(presetOf({ ...none, from: '2026-11-07' }, today)).toBe('7');
		expect(presetOf({ ...none, from: '2026-10-15', to: today }, today)).toBe('30');
		expect(presetOf({ ...none, from: '2026-11-01', to: '2026-11-05' }, today)).toBeNull();
	});
});
