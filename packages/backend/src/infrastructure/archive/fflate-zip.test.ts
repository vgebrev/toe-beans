import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { ZipEntry } from '../../application/ports/index.js';
import { fflateZip, MAX_PUSH } from './fflate-zip.js';

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

/** A stream of `chunks`, recording how far it was read and whether it was cancelled. */
function source(chunks: Uint8Array[]) {
	const seen = { pulled: 0, cancelled: false };
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			const next = chunks[seen.pulled++];
			if (next) controller.enqueue(next);
			else controller.close();
		},
		cancel() {
			seen.cancelled = true;
		}
	});
	return { stream, seen };
}

const read = async (stream: ReadableStream<Uint8Array>) =>
	new Uint8Array(await new Response(stream).arrayBuffer());

describe('fflateZip', () => {
	it('writes bytes and streams, compressed or not, and leaves out what opens to null', async () => {
		const photo = source([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]);
		const entries: ZipEntry[] = [
			{ name: 'household.json', compress: true, open: async () => encode('{"a":1}') },
			{ name: 'photos/a.webp', compress: false, open: async () => photo.stream },
			{ name: 'photos/gone.webp', compress: false, open: async () => null }
		];

		const files = unzipSync(await read(fflateZip(entries)));

		expect(Object.keys(files)).toEqual(['household.json', 'photos/a.webp']);
		expect(decode(files['household.json'])).toBe('{"a":1}');
		expect([...files['photos/a.webp']!]).toEqual([1, 2, 3, 4, 5]);
	});

	it('writes an empty ZIP for no entries', async () => {
		expect(unzipSync(await read(fflateZip([])))).toEqual({});
	});

	it('opens each entry only when the reader gets to it', async () => {
		const opened: string[] = [];
		const entry = (name: string): ZipEntry => ({
			name,
			compress: false,
			open: async () => {
				opened.push(name);
				return encode(name);
			}
		});
		const reader = fflateZip([entry('a'), entry('b'), entry('c')]).getReader();

		await reader.read();

		expect(opened).toEqual(['a']);
		await reader.cancel();
	});

	it('stops reading a photo when the download is cancelled', async () => {
		const many = Array.from({ length: 50 }, () => new Uint8Array(1000));
		const photo = source(many);
		const reader = fflateZip([
			{ name: 'photos/a.webp', compress: false, open: async () => photo.stream }
		]).getReader();

		await reader.read();
		await reader.cancel();

		expect(photo.seen.cancelled).toBe(true);
		expect(photo.seen.pulled).toBeLessThan(many.length);
	});

	it('fails the download when a photo fails part way', async () => {
		const broken = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1]));
				controller.error(new Error('storage went away'));
			}
		});

		await expect(
			read(fflateZip([{ name: 'p.webp', compress: false, open: async () => broken }]))
		).rejects.toThrow('storage went away');
	});
});

describe('fflateZip and the event loop', () => {
	it('compresses a large entry in slices, letting timers run in between', async () => {
		const big = encode('{"line":"some repetitive JSON"},\n'.repeat(60_000));
		let ticks = 0;
		const timer = setInterval(() => ticks++, 0);
		const files = unzipSync(
			await read(fflateZip([{ name: 'big.json', compress: true, open: async () => big }]))
		);
		clearInterval(timer);
		expect(files['big.json']).toEqual(big);
		expect(big.byteLength / MAX_PUSH).toBeGreaterThan(20);
		expect(ticks).toBeGreaterThan(5);
	});
});
