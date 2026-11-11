import { describe, expect, it } from 'vitest';
import {
	addDays,
	daysBetween,
	instantAt,
	isPlainTime,
	todayIn,
	weekday,
	zonedDateTime,
	type PlainDate,
	type PlainTime
} from './calendar.js';

const d = (s: string) => s as PlainDate;
const t = (s: string) => s as PlainTime;

describe('plain dates', () => {
	it('adds days across months and leap years', () => {
		expect(addDays(d('2028-02-28'), 1)).toBe('2028-02-29');
		expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
		expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
	});

	it('counts days between dates', () => {
		expect(daysBetween(d('2026-11-10'), d('2026-12-01'))).toBe(21);
		expect(daysBetween(d('2026-11-10'), d('2026-11-09'))).toBe(-1);
	});

	it('numbers weekdays from Monday', () => {
		expect(weekday(d('2026-11-09'))).toBe(1);
		expect(weekday(d('2026-11-15'))).toBe(7);
	});

	it('takes 24-hour times only', () => {
		expect(isPlainTime('07:05')).toBe(true);
		expect(isPlainTime('23:59')).toBe(true);
		expect(isPlainTime('24:00')).toBe(false);
		expect(isPlainTime('7:05')).toBe(false);
	});
});

describe('household clocks', () => {
	it('reads the date and time in the zone', () => {
		const at = new Date('2026-11-10T22:30:00Z');
		expect(zonedDateTime(at, 'Africa/Johannesburg')).toEqual({ date: '2026-11-11', time: '00:30' });
		expect(todayIn(at, 'America/Los_Angeles')).toBe('2026-11-10');
	});

	it('turns a date and time in the zone into an instant', () => {
		expect(instantAt(d('2026-11-11'), t('07:30'), 'Africa/Johannesburg')).toEqual(
			new Date('2026-11-11T05:30:00Z')
		);
		expect(instantAt(d('2026-11-11'), t('07:30'), 'Asia/Kolkata')).toEqual(
			new Date('2026-11-11T02:00:00Z')
		);
	});

	it('moves a time the clocks skip on by the gap', () => {
		// London goes from 01:00 to 02:00 on 29 March 2026.
		expect(instantAt(d('2026-03-29'), t('01:30'), 'Europe/London')).toEqual(
			new Date('2026-03-29T01:30:00Z')
		);
		expect(zonedDateTime(new Date('2026-03-29T01:30:00Z'), 'Europe/London').time).toBe('02:30');
	});

	it('takes the first of a time the clocks repeat', () => {
		// London goes from 02:00 back to 01:00 on 25 October 2026.
		expect(instantAt(d('2026-10-25'), t('01:30'), 'Europe/London')).toEqual(
			new Date('2026-10-25T00:30:00Z')
		);
	});

	it('keeps the wall-clock time across a change', () => {
		expect(instantAt(d('2026-03-28'), t('07:00'), 'Europe/London')).toEqual(
			new Date('2026-03-28T07:00:00Z')
		);
		expect(instantAt(d('2026-03-30'), t('07:00'), 'Europe/London')).toEqual(
			new Date('2026-03-30T06:00:00Z')
		);
	});
});
