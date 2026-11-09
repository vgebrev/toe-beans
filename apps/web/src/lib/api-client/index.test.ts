import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { ContractError, createApiClient } from './index.js';

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
