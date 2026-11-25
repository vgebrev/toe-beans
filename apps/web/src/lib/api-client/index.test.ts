import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ContractError,
	createApiClient,
	dispositionFilename,
	observeConnection,
	writeCount
} from './index.js';

const Dog = z.object({ id: z.string(), name: z.string() });

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
	return vi.fn<typeof globalThis.fetch>(
		async () =>
			new Response(body === undefined ? null : JSON.stringify(body), {
				status,
				headers: { 'content-type': 'application/json', ...headers }
			})
	);
}

describe('createApiClient', () => {
	it('counts the writes it sends, landed or not, but not reads', async () => {
		const api = createApiClient(respond(500));
		const before = writeCount();
		await api.get('/dogs', Dog);
		expect(writeCount()).toBe(before);
		await api.send('DELETE', '/dogs/d1');
		await createApiClient(vi.fn(async () => Promise.reject(new Error('offline')))).send(
			'POST',
			'/dogs'
		);
		expect(writeCount()).toBe(before + 2);
	});

	it('gets and validates a resource, with its ETag', async () => {
		const fetchMock = respond(200, { id: 'd1', name: 'Ripley' }, { etag: '"3"' });
		const result = await createApiClient(fetchMock).get('/dogs/d1', Dog);

		expect(result).toEqual({ ok: true, data: { id: 'd1', name: 'Ripley' }, etag: '"3"' });
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('/api/v1/dogs/d1');
		expect(init).toMatchObject({ method: 'GET', headers: { accept: 'application/json' } });
		expect(init?.body).toBeUndefined();
	});

	it('sends JSON with If-Match, and accepts 204 without a schema', async () => {
		const fetchMock = vi.fn<typeof globalThis.fetch>(
			async () => new Response(null, { status: 204 })
		);
		const result = await createApiClient(fetchMock).send('PATCH', '/dogs/d1', {
			body: { name: 'Rip' },
			ifMatch: '"3"'
		});

		expect(result).toEqual({ ok: true, data: undefined, etag: undefined });
		expect(fetchMock.mock.calls[0]![1]).toMatchObject({
			method: 'PATCH',
			body: '{"name":"Rip"}',
			headers: { 'content-type': 'application/json', 'if-match': '"3"' }
		});
	});

	it('sends a multipart form as it is, leaving the content type to the browser', async () => {
		const fetchMock = respond(201, { id: 'd1', name: 'Ripley' });
		const form = new FormData();
		form.set('dog', JSON.stringify({ name: 'Ripley' }));
		const result = await createApiClient(fetchMock).send('POST', '/dogs', { form, schema: Dog });

		expect(result).toMatchObject({ ok: true, data: { id: 'd1' } });
		const init = fetchMock.mock.calls[0]![1]!;
		expect(init.body).toBe(form);
		expect(init.headers).toEqual({ accept: 'application/json' });
	});

	it('returns problem details with the request ID', async () => {
		const problem = { type: 'toe-beans/conflict', title: 'Changed by someone else', status: 412 };
		const fetchMock = respond(412, problem, {
			'content-type': 'application/problem+json',
			'x-request-id': 'req-12345678'
		});

		expect(await createApiClient(fetchMock).send('PATCH', '/dogs/d1')).toEqual({
			ok: false,
			error: { kind: 'problem', problem, requestId: 'req-12345678' }
		});
	});

	it('reports an HTTP error without problem details, such as a gateway page', async () => {
		const fetchMock = vi.fn<typeof globalThis.fetch>(
			async () =>
				new Response('<html>502</html>', { status: 502, headers: { 'content-type': 'text/html' } })
		);
		expect(await createApiClient(fetchMock).get('/dogs', Dog)).toEqual({
			ok: false,
			error: { kind: 'http', status: 502, requestId: undefined }
		});
	});

	it('treats malformed problem details as a plain HTTP error', async () => {
		const fetchMock = respond(500, { oops: true }, { 'content-type': 'application/problem+json' });
		const result = await createApiClient(fetchMock).get('/dogs', Dog);
		expect(result).toMatchObject({ ok: false, error: { kind: 'http', status: 500 } });
	});

	it('reports no response as a network error', async () => {
		const fetchMock = vi.fn<typeof globalThis.fetch>(async () => {
			throw new TypeError('Failed to fetch');
		});
		expect(await createApiClient(fetchMock).get('/dogs', Dog)).toEqual({
			ok: false,
			error: { kind: 'network' }
		});
	});

	it("rethrows the caller's own abort", async () => {
		const controller = new AbortController();
		controller.abort();
		const fetchMock = vi.fn<typeof globalThis.fetch>(async () => {
			throw new DOMException('Aborted', 'AbortError');
		});
		await expect(
			createApiClient(fetchMock).get('/dogs', Dog, { signal: controller.signal })
		).rejects.toThrow('Aborted');
	});

	it('throws a ContractError when the response breaks its contract', async () => {
		const fetchMock = respond(200, { id: 'd1' });
		await expect(createApiClient(fetchMock).get('/dogs/d1', Dog)).rejects.toBeInstanceOf(
			ContractError
		);
	});

	it('uses another base URL when the API moves (architecture §4.3)', async () => {
		const fetchMock = respond(200, { id: 'd1', name: 'Ripley' });
		await createApiClient(fetchMock, 'https://api.example.test/v1').get('/dogs/d1', Dog);
		expect(fetchMock.mock.calls[0]![0]).toBe('https://api.example.test/v1/dogs/d1');
	});
});

describe('the connection', () => {
	afterEach(() => {
		observeConnection(null);
		vi.unstubAllGlobals();
	});

	it('tells the observer whether each request reached Toe Beans', async () => {
		const seen: boolean[] = [];
		observeConnection((reached) => seen.push(reached));
		await createApiClient(respond(200, { id: 'd1', name: 'Ripley' })).get('/dogs/d1', Dog);
		await createApiClient(respond(404)).get('/dogs/d2', Dog);
		await createApiClient(respond(503)).get('/dogs', Dog);
		await createApiClient(
			vi.fn<typeof globalThis.fetch>(async () => {
				throw new TypeError('Failed to fetch');
			})
		).get('/dogs', Dog);
		expect(seen).toEqual([true, true, false, false]);
	});

	it('fails a write straight away when the device is offline, without sending or counting it', async () => {
		vi.stubGlobal('navigator', { onLine: false });
		const seen: boolean[] = [];
		observeConnection((reached) => seen.push(reached));
		const fetchMock = respond(201, {});
		const before = writeCount();

		const result = await createApiClient(fetchMock).send('POST', '/dogs', { body: {} });

		expect(result).toEqual({ ok: false, error: { kind: 'network' } });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(writeCount()).toBe(before);
		expect(seen).toEqual([false]);
	});

	it('only fails writes fast: a read is tried, and fails or not on its own', async () => {
		vi.stubGlobal('navigator', { onLine: false });
		const fetchMock = respond(200, { id: 'd1', name: 'Ripley' });
		expect((await createApiClient(fetchMock).get('/dogs/d1', Dog)).ok).toBe(true);
	});
});

describe('downloads', () => {
	it('gives the file and the name the server gave it', async () => {
		const fetchMock = vi.fn<typeof globalThis.fetch>(
			async () =>
				new Response(new Uint8Array([80, 75]), {
					headers: {
						'content-type': 'application/zip',
						'content-disposition': 'attachment; filename="toe-beans-export-2026-11-25.zip"'
					}
				})
		);
		const result = await createApiClient(fetchMock).download('/household/export');
		expect(fetchMock).toHaveBeenCalledWith('/api/v1/household/export', expect.anything());
		if (!result.ok) throw new Error('expected a download');
		expect(result.data.filename).toBe('toe-beans-export-2026-11-25.zip');
		expect([...new Uint8Array(await result.data.blob.arrayBuffer())]).toEqual([80, 75]);
	});

	it('returns a problem as one', async () => {
		const problem = { type: 'toe-beans/rate-limited', title: 'Too many requests', status: 429 };
		const fetchMock = respond(429, problem, { 'content-type': 'application/problem+json' });
		expect(await createApiClient(fetchMock).download('/household/export')).toMatchObject({
			ok: false,
			error: { kind: 'problem', problem: { status: 429 } }
		});
	});

	it('is a network error when the body breaks off part way', async () => {
		const broken = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array([1]));
				controller.error(new Error('reset'));
			}
		});
		const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response(broken));
		expect(await createApiClient(fetchMock).download('/household/export')).toEqual({
			ok: false,
			error: { kind: 'network' }
		});
	});

	it('reads only a plain quoted filename', () => {
		expect(dispositionFilename('attachment; filename="a.zip"')).toBe('a.zip');
		expect(dispositionFilename('attachment')).toBeNull();
		expect(dispositionFilename(null)).toBeNull();
	});
});
