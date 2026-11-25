import { describe, expect, it } from 'vitest';
import { jsonText, LazyList, textStream } from './json-text.js';

const document = {
	schemaVersion: 1,
	exportedAt: new Date('2026-11-25T08:00:00Z'),
	gone: undefined,
	household: { name: 'The "Does"\n', members: [{ id: 'u1', tags: [] }] },
	empty: new LazyList([], (x: number) => x),
	logs: new LazyList([1, 2, 3], (n: number) => ({ n, notes: n === 2 ? 'café 🐾' : null, at: [] })),
	last: null
};
const plain = {
	...document,
	empty: [],
	logs: [1, 2, 3].map((n) => ({ n, notes: n === 2 ? 'café 🐾' : null, at: [] }))
};

describe('jsonText', () => {
	it('writes what JSON.stringify writes, a piece at a time', () => {
		const pieces = [...jsonText(document)];
		expect(pieces.join('')).toBe(JSON.stringify(plain, null, 2) + '\n');
		// One piece per list item, so no piece grows with the list.
		expect(pieces.filter((p) => p.includes('"n":'))).toHaveLength(3);
	});

	it('maps each item only when it comes to it', () => {
		const mapped: number[] = [];
		const pieces = jsonText({ logs: new LazyList([1, 2, 3], (n) => (mapped.push(n), n)) });
		pieces.next();
		pieces.next();
		pieces.next();
		expect(mapped).toEqual([1]);
	});
});

describe('textStream', () => {
	it('encodes the pieces as UTF-8 in reads of about 64 KB', async () => {
		const items = Array.from({ length: 2000 }, (_, i) => ({ i, text: 'x'.repeat(100) }));
		const reader = textStream(jsonText({ items: new LazyList(items, (x) => x) })).getReader();
		const chunks: Uint8Array[] = [];
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		expect(chunks.length).toBeGreaterThan(2);
		expect(Math.max(...chunks.map((c) => c.byteLength))).toBeLessThan(70 * 1024);
		const text = new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
		expect(JSON.parse(text)).toEqual({ items });
	});
});
