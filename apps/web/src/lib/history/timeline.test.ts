import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@toe-beans/contracts';
import { keepList, keptList, matches, placeEntry } from './timeline.js';

const none = { type: null, exercise: null, from: null, to: null };
const by = { caregiverName: 'Sam', updatedByName: 'Sam', version: 1 };

const log = (id: string, at: string, dogId = 'rosie', exercise = 'sit'): HistoryEntry =>
	({
		kind: 'training',
		log: {
			id,
			dogId,
			exercise: { id: exercise, title: exercise },
			practisedAt: at,
			date: at.slice(0, 10),
			time: '10:00',
			outcome: 'not-assessed',
			...by
		}
	}) as unknown as HistoryEntry;
const event = (id: string, at: string, category = 'barking', dogId = 'rosie'): HistoryEntry =>
	({
		kind: 'event',
		event: { id, dogId, category, occurredAt: at, date: at.slice(0, 10), time: '10:00', ...by }
	}) as unknown as HistoryEntry;
const ids = (entries: HistoryEntry[]) =>
	entries.map((e) => (e.kind === 'training' ? e.log.id : e.event.id));

describe('which entries the filters list', () => {
	it('follows the dog, the type, the exercise and the dates', () => {
		const sit = log('a', '2026-11-10T08:00:00Z');
		const bark = event('b', '2026-11-10T08:00:00Z');
		expect(matches(sit, none, null)).toBe(true);
		expect(matches(sit, none, 'miso')).toBe(false);
		expect(matches(sit, { ...none, type: 'training', exercise: 'sit' }, 'rosie')).toBe(true);
		expect(matches(sit, { ...none, exercise: 'down' }, null)).toBe(false);
		expect(matches(sit, { ...none, type: 'events' }, null)).toBe(false);
		expect(matches(bark, { ...none, type: 'events' }, null)).toBe(true);
		expect(matches(bark, { ...none, type: 'barking' }, null)).toBe(true);
		expect(matches(bark, { ...none, type: 'fear' }, null)).toBe(false);
		expect(matches(bark, { ...none, exercise: 'sit' }, null)).toBe(false);
		expect(matches(bark, { ...none, from: '2026-11-10', to: '2026-11-10' }, null)).toBe(true);
		expect(matches(bark, { ...none, from: '2026-11-11' }, null)).toBe(false);
		expect(matches(bark, { ...none, to: '2026-11-09' }, null)).toBe(false);
	});
});

describe('putting an entry back', () => {
	const list = [
		log('c', '2026-11-10T09:00:00Z'),
		event('b', '2026-11-10T08:00:00Z'),
		log('a', '2026-11-09T08:00:00Z')
	];

	it('goes in its place, newest first, then by ID, replacing any copy', () => {
		expect(ids(placeEntry(list, event('x', '2026-11-11T08:00:00Z'), false))).toEqual([
			'x',
			'c',
			'b',
			'a'
		]);
		expect(ids(placeEntry(list, event('d', '2026-11-10T08:00:00Z'), false))).toEqual([
			'c',
			'd',
			'b',
			'a'
		]);
		expect(ids(placeEntry(list, log('b', '2026-11-10T08:00:00Z'), false))).toHaveLength(3);
	});

	it('leaves one older than the list to Load more, but ends a complete list with it', () => {
		const old = event('z', '2026-11-01T08:00:00Z');
		expect(ids(placeEntry(list, old, true))).toEqual(['c', 'b', 'a']);
		expect(ids(placeEntry(list, old, false))).toEqual(['c', 'b', 'a', 'z']);
	});
});

describe('the kept list', () => {
	it('is given back for the same query while nothing was written', () => {
		const entries = [log('a', '2026-11-10T08:00:00Z')];
		keepList({ key: 'type=training', entries, next: 'n', writes: 3 });
		expect(keptList('type=training', 3)).toMatchObject({ entries, next: 'n' });
		expect(keptList('', 3)).toBeNull();
		expect(keptList('type=training', 4)).toBeNull();
	});
});
