import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PhotoStore } from '../../application/ports/index.js';
import { filesystemPhotoStore } from './filesystem.js';

let dir: string;
let store: PhotoStore;
const bytes = new TextEncoder().encode('webp bytes');

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'toe-beans-photos-'));
	store = filesystemPhotoStore(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('filesystemPhotoStore', () => {
	it('puts, streams back and deletes a file, leaving no partial file behind', async () => {
		const key = 'households/h1/dogs/d1/p1-thumb.webp';
		await store.put(key, bytes, 'image/webp');
		expect(await readdir(join(dir, 'households/h1/dogs/d1'))).toEqual(['p1-thumb.webp']);
		const stored = await store.getStream(key);
		expect(stored?.size).toBe(bytes.byteLength);
		expect(new Uint8Array(await new Response(stored!.body).arrayBuffer())).toEqual(bytes);
		await store.delete([key, 'households/h1/missing.webp']);
		expect(await store.getStream(key)).toBeNull();
	});

	it('refuses a key that could leave the directory', async () => {
		for (const key of ['../escape.webp', 'households/../../escape.webp', '/etc/passwd', '']) {
			await expect(store.put(key, bytes, 'image/webp')).rejects.toThrow('not a safe path');
			await expect(store.getStream(key)).rejects.toThrow('not a safe path');
		}
	});
});
