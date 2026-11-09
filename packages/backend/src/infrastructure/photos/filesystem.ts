// A directory as the photo store: for dev, e2e and self-hosting with a mounted volume
// (architecture §3.6, §8). Never on a serverless host, whose filesystem doesn't last (NFR-05).
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { PhotoStore } from '../../application/ports/index.js';

// What photoKey makes: path segments of letters, digits, dots, dashes and underscores.
const safeKey = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export function filesystemPhotoStore(directory: string): PhotoStore {
	const root = resolve(directory);
	const pathOf = (key: string) => {
		const path = join(root, key);
		// The keys are ours, but a key that could climb out of the directory is a bug to stop on.
		if (!safeKey.test(key) || !path.startsWith(root + sep)) {
			throw new Error('photo key is not a safe path');
		}
		return path;
	};
	return {
		async put(key, bytes) {
			const path = pathOf(key);
			await mkdir(dirname(path), { recursive: true });
			// Written beside and renamed into place, so a reader never sees half a file.
			const partial = `${path}.${process.pid}.partial`;
			await writeFile(partial, bytes);
			await rename(partial, path);
		},
		async getStream(key) {
			const path = pathOf(key);
			try {
				const { size } = await stat(path);
				const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
				return { body, size };
			} catch (e) {
				if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
				throw e;
			}
		},
		async delete(keys) {
			await Promise.all(keys.map((key) => rm(pathOf(key), { force: true })));
		}
	};
}
