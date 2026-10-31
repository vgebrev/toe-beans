import { describe, expect, it } from 'vitest';
import { manualClock } from './clock.js';

describe('manualClock', () => {
	it('stays put until moved', () => {
		const clock = manualClock('2026-10-31T08:00:00Z');
		expect(clock.now().toISOString()).toBe('2026-10-31T08:00:00.000Z');
		clock.advance(90_000);
		expect(clock.now().toISOString()).toBe('2026-10-31T08:01:30.000Z');
		clock.set('2027-01-01T00:00:00Z');
		expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
	});

	it('hands out copies, so callers cannot move it', () => {
		const clock = manualClock();
		clock.now().setFullYear(1999);
		expect(clock.now().getUTCFullYear()).toBe(2026);
	});
});
