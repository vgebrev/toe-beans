import { describe, expect, it } from 'vitest';
import { createIdGenerator, idTimestamp, isId, type Id } from './id.js';

const at = (ms: number) => createIdGenerator(() => ms);

describe('createIdGenerator', () => {
	it('makes valid UUIDv7s that encode the time', () => {
		const ms = Date.UTC(2026, 9, 31, 10, 0, 0, 123);
		const id = at(ms).next();
		expect(isId(id)).toBe(true);
		expect(idTimestamp(id)).toBe(ms);
	});

	it('increases within one millisecond', () => {
		const ids = at(1_000).next;
		const made = Array.from({ length: 5000 }, ids); // more than the 12-bit counter holds
		expect([...made].sort()).toEqual(made);
		expect(new Set(made).size).toBe(made.length);
	});

	it('keeps increasing when the clock steps back', () => {
		let ms = 2_000;
		const ids = createIdGenerator(() => ms);
		const first = ids.next();
		ms = 1_000;
		expect(ids.next() > first).toBe(true);
	});

	it('is deterministic with a fixed random source', () => {
		const make = () =>
			createIdGenerator(
				() => 0,
				(bytes) => bytes.fill(0)
			).next();
		expect(make()).toBe('00000000-0000-7000-8000-000000000000');
		expect(make()).toBe(make());
	});
});

describe('isId', () => {
	it.each([
		['00000000-0000-4000-8000-000000000000', 'version 4'],
		['00000000-0000-7000-c000-000000000000', 'wrong variant'],
		['0190F0C0-0000-7000-8000-000000000000', 'uppercase'],
		['../etc/passwd', 'not a UUID']
	])('rejects %s (%s)', (value) => {
		expect(isId(value)).toBe(false);
	});

	it('narrows the type', () => {
		const value: string = at(0).next();
		if (isId(value)) {
			const id: Id = value;
			expect(id).toBe(value);
		}
	});
});
