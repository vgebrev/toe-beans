// UUIDv7 IDs (RFC 9562), generated here rather than by the database so they're known before the
// write and sort by creation time (architecture §7).
import { getRandomValues } from 'node:crypto';

export type Id = string & { readonly __brand: 'Id' };

const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Checks an ID from outside (a URL, a request body). Uppercase is rejected so IDs compare as strings. */
export const isId = (value: string): value is Id => pattern.test(value);

export interface IdGenerator {
	next(): Id;
}

const COUNTER_MAX = 0xfff;
const COUNTER_SEED_MAX = 0x7ff; // a fresh millisecond leaves half the counter for IDs made in it

/**
 * IDs are strictly increasing within a process, even within one millisecond or if the clock steps
 * back: rand_a is a 12-bit counter (RFC 9562 §6.2 method 1), seeded randomly each millisecond.
 */
export function createIdGenerator(
	now: () => number,
	random: (bytes: Uint8Array) => void = (bytes) => void getRandomValues(bytes)
): IdGenerator {
	let lastMs = -1;
	let counter = 0;
	const bytes = new Uint8Array(16);
	const seed = new Uint8Array(2);

	return {
		next() {
			const ms = now();
			if (ms > lastMs) {
				lastMs = ms;
				random(seed);
				counter = ((seed[0]! << 8) | seed[1]!) & COUNTER_SEED_MAX;
			} else if (++counter > COUNTER_MAX) {
				lastMs++;
				counter = 0;
			}

			random(bytes);
			// 48-bit big-endian timestamp. Bitwise operators are 32-bit, so split it.
			const high = Math.floor(lastMs / 2 ** 16);
			bytes[0] = high >>> 24;
			bytes[1] = high >>> 16;
			bytes[2] = high >>> 8;
			bytes[3] = high;
			bytes[4] = lastMs >>> 8;
			bytes[5] = lastMs;
			bytes[6] = 0x70 | (counter >>> 8); // version 7
			bytes[7] = counter;
			bytes[8] = 0x80 | (bytes[8]! & 0x3f); // variant 10

			const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
			return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Id;
		}
	};
}

/** The creation time encoded in an ID, to the millisecond. */
export const idTimestamp = (id: Id): number => parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
