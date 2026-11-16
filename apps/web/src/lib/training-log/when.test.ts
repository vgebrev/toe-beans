import { describe, expect, it } from 'vitest';
import { instantIn, practisedAt, zonedParts } from './when.js';

describe('instantIn', () => {
	it('reads a date and time on the household’s clocks', () => {
		expect(instantIn('2026-11-10', '17:30', 'Africa/Johannesburg').toISOString()).toBe(
			'2026-11-10T15:30:00.000Z'
		);
		expect(instantIn('2026-07-01', '09:00', 'Europe/London').toISOString()).toBe(
			'2026-07-01T08:00:00.000Z'
		);
		expect(instantIn('2026-01-01', '09:00', 'Europe/London').toISOString()).toBe(
			'2026-01-01T09:00:00.000Z'
		);
	});

	it('round-trips with zonedParts', () => {
		const at = new Date('2026-11-10T22:45:00Z');
		const parts = zonedParts(at, 'Pacific/Auckland');
		expect(parts).toEqual({ date: '2026-11-11', time: '11:45' });
		expect(instantIn(parts.date, parts.time, 'Pacific/Auckland')).toEqual(at);
	});
});

describe('practisedAt', () => {
	const now = new Date('2026-11-10T15:00:00Z');
	const picked = { date: '2026-11-09', time: '08:00' };
	it('leaves now to the server, and counts back for the quick choices', () => {
		expect(practisedAt('now', picked, 'Africa/Johannesburg', now)).toBeUndefined();
		expect(practisedAt('15', picked, 'Africa/Johannesburg', now)).toBe('2026-11-10T14:45:00.000Z');
		expect(practisedAt('60', picked, 'Africa/Johannesburg', now)).toBe('2026-11-10T14:00:00.000Z');
		expect(practisedAt('earlier', picked, 'Africa/Johannesburg', now)).toBe(
			'2026-11-09T06:00:00.000Z'
		);
	});
});
