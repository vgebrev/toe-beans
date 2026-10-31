import type { Clock } from '../application/ports/index.js';

export const systemClock: Clock = { now: () => new Date() };
