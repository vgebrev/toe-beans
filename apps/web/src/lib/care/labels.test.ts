import { describe, expect, it } from 'vitest';
import { addMonths, duePhrase, historyLine } from './labels.js';

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

	it('adds months, keeping to the month’s last day', () => {
		expect(addMonths('2026-11-09', 1)).toBe('2026-12-09');
		expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
		expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
		expect(addMonths('2026-11-09', 12)).toBe('2027-11-09');
	});
});
