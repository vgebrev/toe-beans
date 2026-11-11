import { describe, expect, it } from 'vitest';
import {
	addDays,
	dayName,
	isoWeek,
	isPlainDate,
	mondayOf,
	mondayOfIsoWeek,
	repeatSummary,
	roundTime,
	todayIn,
	weekRange
} from './dates.js';

describe('weeks', () => {
	it('start on Monday', () => {
		expect(mondayOf('2026-11-10')).toBe('2026-11-09');
		expect(mondayOf('2026-11-15')).toBe('2026-11-09');
		expect(mondayOf('2026-11-09')).toBe('2026-11-09');
	});

	it('are named by ISO week, across the year boundary', () => {
		expect(isoWeek('2026-11-10')).toBe('2026-W46');
		expect(isoWeek('2026-12-31')).toBe('2026-W53');
		expect(isoWeek('2027-01-03')).toBe('2026-W53');
		expect(isoWeek('2027-01-04')).toBe('2027-W01');
	});

	it('read back from the URL, refusing what isn’t a week', () => {
		expect(mondayOfIsoWeek('2026-W46')).toBe('2026-11-09');
		expect(mondayOfIsoWeek('2026-W53')).toBe('2026-12-28');
		expect(mondayOfIsoWeek('2027-W53')).toBeNull();
		expect(mondayOfIsoWeek('2026-46')).toBeNull();
		expect(mondayOfIsoWeek(null)).toBeNull();
	});

	it('are labelled by their dates', () => {
		// ICU's spacing around the dash varies by version, so only the order is checked.
		const plain = (s: string) => s.replace(/\s+/g, ' ');
		expect(plain(weekRange('2026-11-09', 'en-GB'))).toMatch(/^9 ?– ?15 Nov$/);
		expect(plain(weekRange('2026-11-09', 'en-US'))).toMatch(/^Nov 9 ?– ?15$/);
		expect(plain(weekRange('2026-12-28', 'en-GB'))).toMatch(/^28 Dec( 2026)? – 3 Jan( 2027)?$/);
	});
});

describe('days', () => {
	it('are checked and counted', () => {
		expect(isPlainDate('2026-02-29')).toBe(false);
		expect(isPlainDate('2028-02-29')).toBe(true);
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('are today on the household’s clocks', () => {
		const late = new Date('2026-11-10T22:30:00Z');
		expect(todayIn('Africa/Johannesburg', late)).toBe('2026-11-11');
		expect(todayIn('UTC', late)).toBe('2026-11-10');
	});

	it('are named relative to today', () => {
		expect(dayName('2026-11-10', '2026-11-10')).toBe('Today');
		expect(dayName('2026-11-11', '2026-11-10')).toBe('Tomorrow');
		expect(dayName('2026-11-13', '2026-11-10', 'en-GB')).toBe('Fri 13 Nov');
	});
});

describe('repeats', () => {
	it('are summed up in words', () => {
		expect(repeatSummary([1, 2, 3, 4, 5, 6, 7], undefined, 'en-GB')).toBe('Every day');
		expect(repeatSummary([1, 2, 3, 4, 5], '2026-12-01', 'en-GB')).toBe('Weekdays until 1 Dec');
		expect(repeatSummary([1, 3, 5], undefined, 'en-GB')).toBe('Every Mon, Wed, Fri');
	});
});

describe('times', () => {
	it('round to 5-minute steps', () => {
		expect(roundTime('07:02')).toBe('07:00');
		expect(roundTime('07:03')).toBe('07:05');
		expect(roundTime('07:58')).toBe('08:00');
		expect(roundTime('23:58')).toBe('23:55');
	});
});
