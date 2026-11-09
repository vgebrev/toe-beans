// An S3-compatible bucket as the photo store: Cloudflare R2 in prod, SeaweedFS in compose
// (architecture §3.6). Plain S3 calls signed with SigV4 by aws4fetch, which is all three
// operations need, instead of the much larger AWS SDK. The bucket stays private: photos are only
// ever streamed through the app, which checks the household first.
import { AwsClient } from 'aws4fetch';
import type { PhotoStore } from '../../application/ports/index.js';

export interface S3PhotoStoreOptions {
	/** e.g. `https://<account>.r2.cloudflarestorage.com` or `http://localhost:8333`. */
	endpoint: string;
	bucket: string;
	/** `auto` for R2. */
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
}

export class PhotoStoreError extends Error {
	override name = 'PhotoStoreError';
}

export function s3PhotoStore(options: S3PhotoStoreOptions): PhotoStore {
	const client = new AwsClient({
		accessKeyId: options.accessKeyId,
		secretAccessKey: options.secretAccessKey,
		service: 's3',
		region: options.region
	});
	const fetch = options.fetch ?? globalThis.fetch;
	const timeoutMs = options.timeoutMs ?? 30_000;
	// Path-style, which R2 and SeaweedFS both take. Keys are ours (photoKey), so they need no encoding.
	const base = `${options.endpoint.replace(/\/$/, '')}/${options.bucket}/`;

	async function send(method: string, key: string, init: RequestInit = {}): Promise<Response> {
		const request = await client.sign(base + key, { method, ...init });
		return fetch(request, { signal: AbortSignal.timeout(timeoutMs) });
	}
	// The status only: an S3 error body can echo the request, and that's not for the logs.
	const failed = (method: string, response: Response) =>
		new PhotoStoreError(`photo store ${method} failed with ${response.status}`);

	return {
		async put(key, bytes, contentType) {
			const response = await send('PUT', key, {
				// The DOM types want an ArrayBuffer-backed array; ours always are.
				body: bytes as Uint8Array<ArrayBuffer>,
				headers: { 'content-type': contentType, 'content-length': String(bytes.byteLength) }
			});
			await response.body?.cancel();
			if (!response.ok) throw failed('PUT', response);
		},
		async getStream(key) {
			const response = await send('GET', key);
			if (response.status === 404) {
				await response.body?.cancel();
				return null;
			}
			if (!response.ok || !response.body) {
				await response.body?.cancel();
				throw failed('GET', response);
			}
			return { body: response.body, size: Number(response.headers.get('content-length') ?? 0) };
		},
		async delete(keys) {
			await Promise.all(
				keys.map(async (key) => {
					const response = await send('DELETE', key);
					await response.body?.cancel();
					if (!response.ok && response.status !== 404) throw failed('DELETE', response);
				})
			);
		}
	};
}
