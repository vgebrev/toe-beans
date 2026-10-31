// Test doubles for the ports, used by unit tests of use cases and by the integration suites.
import type { Clock } from '../application/ports/index.js';

export interface ManualClock extends Clock {
	set(instant: Date | string): void;
	advance(ms: number): void;
}

/** A clock that only moves when told to. */
export function manualClock(start: Date | string = '2026-01-01T00:00:00Z'): ManualClock {
	let current = new Date(start).getTime();
	return {
		now: () => new Date(current),
		set: (instant) => void (current = new Date(instant).getTime()),
		advance: (ms) => void (current += ms)
	};
}
