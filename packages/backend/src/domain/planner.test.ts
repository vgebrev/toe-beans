import { describe, expect, it } from 'vitest';
import type { PlainDate, PlainTime, Weekday } from './calendar.js';
import { checkSchedule, keyDate, occurrences, WEEKDAYS } from './planner.js';

const d = (s: string) => s as PlainDate;
const t = (s: string) => s as PlainTime;
const today = d('2026-11-10'); // a Tuesday
const keys = (found: { key: string }[]) => found.map((o) => o.key);

describe('occurrences', () => {
	it('falls on the chosen weekdays from the start', () => {
		const plan = { startDate: d('2026-11-10'), times: [t('07:00')], days: [1, 3, 5] as Weekday[] };
		expect(keys(occurrences(plan, d('2026-11-01'), d('2026-11-20')))).toEqual([
			'2026-11-11T07:00',
			'2026-11-13T07:00',
			'2026-11-16T07:00',
			'2026-11-18T07:00',
			'2026-11-20T07:00'
		]);
	});

	it('stops at the end date', () => {
		const plan = {
			startDate: d('2026-11-10'),
			times: [t('07:00')],
			days: [...WEEKDAYS],
			until: d('2026-11-12')
		};
		expect(keys(occurrences(plan, d('2026-11-10'), d('2026-11-30')))).toEqual([
			'2026-11-10T07:00',
			'2026-11-11T07:00',
			'2026-11-12T07:00'
		]);
	});

	it('falls at each time of day, in time order', () => {
		const plan = {
			startDate: d('2026-11-10'),
			times: [t('07:00'), t('12:00'), t('18:00')],
			days: [...WEEKDAYS]
		};
		const found = occurrences(plan, d('2026-11-10'), d('2026-11-11'));
		expect(keys(found)).toEqual([
			'2026-11-10T07:00',
			'2026-11-10T12:00',
			'2026-11-10T18:00',
			'2026-11-11T07:00',
			'2026-11-11T12:00',
			'2026-11-11T18:00'
		]);
		expect(found[1]).toEqual({ date: '2026-11-10', time: '12:00', key: '2026-11-10T12:00' });
	});

	it('leaves out the first day’s times before its start time, and only that day’s', () => {
		const plan = {
			startDate: d('2026-11-10'),
			startTime: t('12:00'),
			times: [t('07:00'), t('12:00'), t('18:00')],
			days: [...WEEKDAYS]
		};
		expect(keys(occurrences(plan, d('2026-11-10'), d('2026-11-11')))).toEqual([
			'2026-11-10T12:00',
			'2026-11-10T18:00',
			'2026-11-11T07:00',
			'2026-11-11T12:00',
			'2026-11-11T18:00'
		]);
	});

	it('keys sort in time order, and a date alone before its day', () => {
		const sorted = ['2026-11-10T18:00', '2026-11-11T07:00', '2026-11-10', '2026-11-10T07:00'];
		expect(sorted.sort()).toEqual([
			'2026-11-10',
			'2026-11-10T07:00',
			'2026-11-10T18:00',
			'2026-11-11T07:00'
		]);
		expect(keyDate('2026-11-10T07:00')).toBe('2026-11-10');
	});
});

describe('checking a schedule', () => {
	it('takes a one-off time today or later', () => {
		expect(checkSchedule({ date: '2026-11-10', times: ['17:30'] }, today)).toEqual({
			ok: true,
			value: { date: '2026-11-10', times: ['17:30'], repeat: null }
		});
	});

	it('tidies the days of a repeat, and sorts its times', () => {
		expect(
			checkSchedule(
				{
					date: '2026-11-10',
					times: ['18:00', '07:00'],
					repeat: { days: [5, 1, 1], until: '2026-12-01' }
				},
				today
			)
		).toEqual({
			ok: true,
			value: {
				date: '2026-11-10',
				times: ['07:00', '18:00'],
				repeat: { days: [1, 5], until: '2026-12-01' }
			}
		});
	});

	it('says what is wrong with each field', () => {
		expect(
			checkSchedule(
				{ date: '2026-11-09', times: ['07:03'], repeat: { days: [], until: '2026-11-01' } },
				today
			)
		).toEqual({
			ok: false,
			fields: {
				date: ['Choose today or a later date.'],
				'times.0': ['Choose a time in 5-minute steps.'],
				'repeat.days': ['Choose at least one day.'],
				'repeat.until': ['End on or after the first date.']
			}
		});
		expect(
			checkSchedule(
				{ date: '2026-11-12', times: ['7am'], repeat: { days: [8], until: '2026-11-11' } },
				today
			)
		).toEqual({
			ok: false,
			fields: {
				'times.0': ['Choose a time.'],
				'repeat.days': ['Choose at least one day.'],
				'repeat.until': ['End on or after the first date.']
			}
		});
	});

	it('says which of several times is wrong, or repeated', () => {
		expect(
			checkSchedule(
				{ date: '2026-11-10', times: ['07:00', '', '07:00'], repeat: { days: [...WEEKDAYS] } },
				today
			)
		).toEqual({
			ok: false,
			fields: { 'times.1': ['Choose a time.'], 'times.2': ['That time is already in.'] }
		});
	});

	it('takes several times only with a repeat, up to six, and at least one', () => {
		expect(checkSchedule({ date: '2026-11-10', times: ['07:00', '12:00'] }, today)).toEqual({
			ok: false,
			fields: { times: ['Choose how it repeats to plan several times a day.'] }
		});
		const seven = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
		expect(
			checkSchedule({ date: '2026-11-10', times: seven, repeat: { days: [1] } }, today)
		).toEqual({ ok: false, fields: { times: ['Choose up to 6 times a day.'] } });
		expect(checkSchedule({ date: '2026-11-10', times: [] }, today)).toEqual({
			ok: false,
			fields: { times: ['Choose a time.'] }
		});
	});

	it('plans up to a year ahead', () => {
		expect(checkSchedule({ date: '2027-11-12', times: ['07:00'] }, today)).toMatchObject({
			ok: false,
			fields: { date: ['Choose a date within the next year.'] }
		});
	});
});
