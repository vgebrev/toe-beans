import { describe, expect, it } from 'vitest';
import { duePhrase, historyLine, NEXT_CHOICES, nextDueDate } from './labels.js';

describe('care labels', () => {
	it('says when a task is due', () => {
		expect(duePhrase({ dueDate: '2026-11-10' }, '2026-11-10', 'en-GB')).toBe('today');
		expect(duePhrase({ dueDate: '2026-11-11', dueTime: '09:30' }, '2026-11-10', 'en-GB')).toBe(
			'tomorrow at 09:30'
		);
	});

	it('reads the history', () => {
		const common = { at: '2026-11-10T15:00:00.000Z', by: 'Sam' };
		expect(historyLine({ kind: 'cancelled', ...common })).toBe('Cancelled');
		expect(historyLine({ kind: 'reopened', ...common })).toBe('Put back as upcoming');
	});

	it('plans the next one tomorrow from today, and the rest from the day it was done', () => {
		// Done on Monday 9 November, marked on Tuesday the 10th.
		const due = Object.fromEntries(
			NEXT_CHOICES.map((c) => [c.label, nextDueDate(c, '2026-11-10', '2026-11-09')])
		);
		expect(due).toEqual({
			Tomorrow: '2026-11-11',
			'Next week': '2026-11-16',
			'In a month': '2026-12-09',
			'In a year': '2027-11-09'
		});
	});
});
