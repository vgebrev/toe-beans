// An S3-compatible bucket as the photo store: Cloudflare R2 in prod, SeaweedFS in compose
// (architecture §3.6). Plain S3 calls signed with SigV4 by aws4fetch, which is all three
// operations need, instead of the much larger AWS SDK. The bucket stays private: photos are only
// ever streamed through the app, which checks the household first. Deleting a household's photos
// lists them by prefix (ListObjectsV2) and deletes each, so it needs no batch-delete call either.
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

	async function deleteKeys(keys: readonly string[]) {
		await Promise.all(
			keys.map(async (key) => {
				const response = await send('DELETE', key);
				await response.body?.cancel();
				if (!response.ok && response.status !== 404) throw failed('DELETE', response);
			})
		);
	}

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
		delete: deleteKeys,
		async deletePrefix(prefix) {
			let deleted = 0;
			let token: string | undefined;
			do {
				const query = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' });
				if (token) query.set('continuation-token', token);
				const response = await send('GET', `?${query}`);
				if (!response.ok) {
					await response.body?.cancel();
					throw failed('LIST', response);
				}
				const page = parseListing(await response.text());
				// A few at a time: a household has at most a few hundred objects.
				for (let i = 0; i < page.keys.length; i += 10) {
					await deleteKeys(page.keys.slice(i, i + 10));
				}
				deleted += page.keys.length;
				token = page.nextToken;
			} while (token);
			return deleted;
		}
	};
}

const xmlText = (s: string) =>
	s
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replaceAll('&amp;', '&');

/** The keys and continuation token from a ListObjectsV2 response; the shape is flat enough for this. */
export function parseListing(xml: string): { keys: string[]; nextToken?: string } {
	const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => xmlText(m[1]!));
	const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
	const token = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1];
	return truncated && token ? { keys, nextToken: xmlText(token) } : { keys };
}
