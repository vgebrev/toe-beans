import { describe, expect, it } from 'vitest';
import type { PlainDate, Weekday } from './calendar.js';
import { checkSchedule, occurrenceDates, WEEKDAYS } from './planner.js';

const d = (s: string) => s as PlainDate;
const today = d('2026-11-10'); // a Tuesday

describe('occurrence dates', () => {
	it('falls on the chosen weekdays from the start', () => {
		const plan = { startDate: d('2026-11-10'), days: [1, 3, 5] satisfies Weekday[] };
		expect(occurrenceDates(plan, d('2026-11-01'), d('2026-11-20'))).toEqual([
			'2026-11-11',
			'2026-11-13',
			'2026-11-16',
			'2026-11-18',
			'2026-11-20'
		]);
	});

	it('stops at the end date', () => {
		const plan = { startDate: d('2026-11-10'), days: [...WEEKDAYS], until: d('2026-11-12') };
		expect(occurrenceDates(plan, d('2026-11-10'), d('2026-11-30'))).toEqual([
			'2026-11-10',
			'2026-11-11',
			'2026-11-12'
		]);
	});
});

describe('checking a schedule', () => {
	it('takes a one-off time today or later', () => {
		expect(checkSchedule({ date: '2026-11-10', time: '17:30' }, today)).toEqual({
			ok: true,
			value: { date: '2026-11-10', time: '17:30', repeat: null }
		});
	});

	it('tidies the days of a repeat', () => {
		expect(
			checkSchedule(
				{ date: '2026-11-10', time: '07:00', repeat: { days: [5, 1, 1], until: '2026-12-01' } },
				today
			)
		).toEqual({
			ok: true,
			value: { date: '2026-11-10', time: '07:00', repeat: { days: [1, 5], until: '2026-12-01' } }
		});
	});

	it('says what is wrong with each field', () => {
		expect(
			checkSchedule(
				{ date: '2026-11-09', time: '07:03', repeat: { days: [], until: '2026-11-01' } },
				today
			)
		).toEqual({
			ok: false,
			fields: {
				date: ['Choose today or a later date.'],
				time: ['Choose a time in 5-minute steps.'],
				'repeat.days': ['Choose at least one day.'],
				'repeat.until': ['End on or after the first date.']
			}
		});
		expect(
			checkSchedule(
				{ date: '2026-11-12', time: '7am', repeat: { days: [8], until: '2026-11-11' } },
				today
			)
		).toEqual({
			ok: false,
			fields: {
				time: ['Choose a time.'],
				'repeat.days': ['Choose at least one day.'],
				'repeat.until': ['End on or after the first date.']
			}
		});
	});

	it('plans up to a year ahead', () => {
		expect(checkSchedule({ date: '2027-11-12', time: '07:00' }, today)).toMatchObject({
			ok: false,
			fields: { date: ['Choose a date within the next year.'] }
		});
	});
});
