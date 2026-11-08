import { describe, expect, it } from 'vitest';
import { adoptedText, ageText, monthsAgo, monthsBetween, todayIn } from './age.js';

describe('monthsBetween', () => {
	it('counts whole months', () => {
		expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(0);
		expect(monthsBetween('2026-01-31', '2026-03-01')).toBe(1);
		expect(monthsBetween('2025-11-08', '2026-11-08')).toBe(12);
		expect(monthsBetween('2026-11-09', '2026-11-08')).toBe(0);
	});
});

describe('ageText', () => {
	const today = '2026-11-08';
	it('uses days, then weeks, then months, then years', () => {
		expect(ageText({ date: '2026-11-07', precision: 'day' }, today)).toBe('1 day');
		expect(ageText({ date: '2026-10-20', precision: 'day' }, today)).toBe('2 weeks');
		expect(ageText({ date: '2026-07-01', precision: 'day' }, today)).toBe('4 months');
		expect(ageText({ date: '2024-10-01', precision: 'day' }, today)).toBe('2 years');
		expect(ageText({ date: '2025-01-01', precision: 'day' }, today)).toBe('22 months');
	});

	it('says "about" when the birth date is an estimate', () => {
		expect(ageText({ date: '2026-07-08', precision: 'month' }, today)).toBe('about 4 months');
		expect(ageText({ date: '2023-01-01', precision: 'year' }, today)).toBe('about 3 years');
	});
});

describe('adoptedText', () => {
	it('says how long ago', () => {
		expect(adoptedText('2026-11-08', '2026-11-08')).toBe('Adopted today');
		expect(adoptedText('2026-08-01', '2026-11-08')).toBe('Adopted 3 months ago');
		expect(adoptedText('2026-11-05', '2026-11-08')).toBe('Adopted 3 days ago');
	});
});

describe('monthsAgo', () => {
	it('steps back whole months, keeping the day where the month has it', () => {
		expect(monthsAgo(4, '2026-11-08')).toBe('2026-07-08');
		expect(monthsAgo(3, '2026-05-31')).toBe('2026-02-28');
		expect(monthsAgo(14, '2026-01-15')).toBe('2024-11-15');
		expect(monthsAgo(0, '2026-11-08')).toBe('2026-11-08');
	});

	it('is the age it was worked out from', () => {
		expect(ageText({ date: monthsAgo(4, '2026-11-08'), precision: 'month' }, '2026-11-08')).toBe(
			'about 4 months'
		);
	});
});

describe('todayIn', () => {
	it('is the date in that time zone', () => {
		const late = new Date('2026-11-08T23:30:00Z');
		expect(todayIn('UTC', late)).toBe('2026-11-08');
		expect(todayIn('Africa/Johannesburg', late)).toBe('2026-11-09');
	});
});
