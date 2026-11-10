import { describe, expect, it } from 'vitest';
import { editedWhen } from './edited.js';

const now = new Date('2026-11-09T10:00:00Z');
const zone = 'Africa/Johannesburg';
const at = (iso: string) => editedWhen(iso, now, zone, 'en-GB');

describe('editedWhen', () => {
	it('is today-relative within the day', () => {
		expect(at('2026-11-09T09:59:30Z')).toBe('just now');
		expect(at('2026-11-09T09:55:00Z')).toBe('5 minutes ago');
		expect(at('2026-11-09T07:00:00Z')).toBe('3 hours ago');
	});

	it('counts days as the household sees them', () => {
		// 23:30 the evening before in Johannesburg, though under 11 hours ago.
		expect(at('2026-11-08T21:30:00Z')).toBe('yesterday');
		expect(at('2026-11-05T12:00:00Z')).toBe('4 days ago');
	});

	it('names the date after a week, with the year only when it differs', () => {
		expect(at('2026-10-27T12:00:00Z')).toBe('on Tue 27 Oct');
		expect(at('2025-10-28T12:00:00Z')).toBe('on Tue 28 Oct 2025');
	});

	it("doesn't go negative when the device clock is behind", () => {
		expect(at('2026-11-09T10:05:00Z')).toBe('just now');
	});
});
