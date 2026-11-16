import { describe, expect, it } from 'vitest';
import { checkValues, outcomeOf, timesBody, type SessionValues } from './form.js';

const values = (changes: Partial<SessionValues> = {}): SessionValues => ({
	dogId: 'd1',
	exerciseId: 'recall-basics',
	date: '2026-11-17',
	times: ['07:00'],
	repeat: 'daily',
	days: [],
	until: '',
	...changes
});

describe('several times a day', () => {
	it('says which extra time is empty or repeated, and only with a repeat', () => {
		expect(checkValues(values({ times: ['07:00', '', '07:00'] }), '2026-11-16')).toEqual({
			'time-1': 'Choose a time, or remove it.',
			'time-2': 'That time is already in.'
		});
		expect(checkValues(values({ times: ['07:00', ''], repeat: 'never' }), '2026-11-16')).toEqual(
			{}
		);
	});

	it('sends the first time alone without a repeat, and every time with one, in order', () => {
		expect(timesBody(values({ times: ['18:00', '07:00'], repeat: 'never' }))).toEqual(['18:00']);
		expect(timesBody(values({ times: ['18:00', '07:00'] }))).toEqual(['18:00', '07:00']);
	});

	it('puts the server’s error for a time by its row', () => {
		expect(
			outcomeOf({
				kind: 'problem',
				problem: {
					type: 'about:blank',
					title: 'Invalid',
					status: 400,
					errors: { 'times.0': ['Choose a time.'], 'times.2': ['x'], times: ['Up to 6.'] }
				}
			} as never)
		).toEqual({
			kind: 'invalid',
			fields: { time: 'Choose a time.', 'time-2': 'x', times: 'Up to 6.' }
		});
	});
});
