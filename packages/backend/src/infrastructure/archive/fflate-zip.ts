// The ZipWriter port on fflate (architecture D46). Pull-driven: each read of the stream moves the
// writer on by one chunk of input, so a slow download holds back the reads from photo storage
// rather than buffering the whole archive in memory.
//
// fflate compresses synchronously, in JavaScript, so input goes in at most 64 KB at a time, with a
// turn of the event loop after each: a few milliseconds of work, never hundreds. On one instance
// (D13) a long stall would hold up everyone else's requests.
import { setImmediate as nextTurn } from 'node:timers/promises';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { ZipEntry, ZipWriter } from '../../application/ports/index.js';

/** The most input pushed in one go, in bytes. */
export const MAX_PUSH = 64 * 1024;

export const fflateZip: ZipWriter = (entries: readonly ZipEntry[]) => {
	const out: Uint8Array[] = [];
	let finished = false;
	let failure: { error: unknown } | null = null;
	const zip = new Zip((error, chunk, final) => {
		if (error) failure = { error };
		else out.push(chunk);
		if (final) finished = true;
	});

	async function* write(): AsyncGenerator<void, void, undefined> {
		for (const entry of entries) {
			const content = await entry.open();
			if (!content) continue;
			const file = entry.compress
				? new ZipDeflate(entry.name, { level: 6 })
				: new ZipPassThrough(entry.name);
			zip.add(file);
			/** Pushes `bytes` in slices, yielding after each so the stream can pass on the output. */
			async function* push(bytes: Uint8Array) {
				for (let at = 0; at < bytes.byteLength; at += MAX_PUSH) {
					file.push(bytes.subarray(at, at + MAX_PUSH));
					await nextTurn();
					yield;
				}
			}
			if (content instanceof Uint8Array) {
				yield* push(content);
				file.push(new Uint8Array(0), true);
				yield;
				continue;
			}
			const reader = content.getReader();
			let read = false;
			try {
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					yield* push(value);
				}
				read = true;
			} finally {
				// Cancelled part way: stop reading from storage too.
				if (!read) await reader.cancel().catch(() => undefined);
			}
			file.push(new Uint8Array(0), true);
			yield;
		}
		zip.end();
	}
	const steps = write();

	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			while (out.length === 0 && !finished && !failure) {
				if ((await steps.next()).done && !finished) throw new Error('the ZIP was not finished');
			}
			if (failure) throw (failure as { error: unknown }).error;
			for (const chunk of out.splice(0)) controller.enqueue(chunk);
			if (finished) controller.close();
		},
		async cancel() {
			await steps.return(undefined);
		}
	});
};
