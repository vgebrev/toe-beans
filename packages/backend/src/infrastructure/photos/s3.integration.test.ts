import type { StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startSeaweedFs, TEST_BUCKET, TEST_CREDENTIALS } from '../../../test/seaweedfs.js';
import type { PhotoStore } from '../../application/ports/index.js';
import { s3PhotoStore } from './s3.js';

let container: StartedTestContainer;
let endpoint: string;
let store: PhotoStore;

beforeAll(async () => {
	({ container, endpoint } = await startSeaweedFs());
	store = s3PhotoStore({ endpoint, bucket: TEST_BUCKET, region: 'us-east-1', ...TEST_CREDENTIALS });
	// /healthz answers before the first volume is ready, and the first write waits for one.
	await store.put('warm-up', new Uint8Array(1), 'application/octet-stream');
}, 120_000);

afterAll(() => container?.stop());

const bytes = new TextEncoder().encode('webp bytes');
const read = async (body: ReadableStream<Uint8Array>) =>
	new Uint8Array(await new Response(body).arrayBuffer());

describe('s3PhotoStore', () => {
	it('puts, streams back and deletes an object', async () => {
		const key = 'households/h1/dogs/d1/p1-thumb.webp';
		await store.put(key, bytes, 'image/webp');
		const stored = await store.getStream(key);
		expect(stored?.size).toBe(bytes.byteLength);
		expect(await read(stored!.body)).toEqual(bytes);
		await store.delete([key]);
		expect(await store.getStream(key)).toBeNull();
	});

	it('is null for a missing key, and deleting one is fine', async () => {
		expect(await store.getStream('households/h1/nothing.webp')).toBeNull();
		await expect(store.delete(['households/h1/nothing.webp'])).resolves.toBeUndefined();
	});

	it("deletes everything under a household's prefix, and only that", async () => {
		const mine = ['households/h2/dogs/d1/p1-thumb.webp', 'households/h2/dogs/d2/p2-large.webp'];
		const theirs = 'households/h20/dogs/d3/p3-thumb.webp';
		for (const key of [...mine, theirs]) await store.put(key, bytes, 'image/webp');
		expect(await store.deletePrefix('households/h2/')).toBe(2);
		for (const key of mine) expect(await store.getStream(key)).toBeNull();
		expect(await store.getStream(theirs)).not.toBeNull();
		expect(await store.deletePrefix('households/h2/')).toBe(0);
	});

	it("keeps the bucket private: an unsigned request can't read", async () => {
		const key = 'households/h1/dogs/d1/p2-large.webp';
		await store.put(key, bytes, 'image/webp');
		const anonymous = await fetch(`${endpoint}/${TEST_BUCKET}/${key}`);
		await anonymous.body?.cancel();
		expect(anonymous.status).toBe(403);
	});

	it('throws on a wrong key, naming only the status', async () => {
		const wrong = s3PhotoStore({
			endpoint,
			bucket: TEST_BUCKET,
			region: 'us-east-1',
			accessKeyId: TEST_CREDENTIALS.accessKeyId,
			secretAccessKey: 'wrong'
		});
		await expect(wrong.put('households/h1/x.webp', bytes, 'image/webp')).rejects.toThrow(
			/^photo store PUT failed with 403$/
		);
	});
});
