// Typed client for /api/v1 (architecture §3.3). Pages call the API through this, never backend
// code, so the app can later split into a static frontend and a separate API (§4.3). Universal
// `load` functions pass SvelteKit's `fetch`; components can pass the global one.
//
// Every outcome is a value, never a throw, so the UI can be honest about it (ui.md §5.2,
// NFR-04): a problem+json error from the API, another HTTP error (such as a gateway 502 during
// a cold start), or no response at all (offline). The one exception is a response that doesn't
// match its contract: that's a bug, and it throws so error reporting sees it.
import { Problem } from '@toe-beans/contracts';

/** Anything with Zod's `safeParse`, such as the DTO schemas in @toe-beans/contracts. */
export interface Schema<T> {
	safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
}

export type ApiError =
	/** The API answered with RFC 9457 problem details. */
	| { kind: 'problem'; problem: Problem; requestId?: string }
	/** An HTTP error without problem details: a gateway or platform error page. */
	| { kind: 'http'; status: number; requestId?: string }
	/** No response: offline, DNS failure, connection dropped. */
	| { kind: 'network' };

export type ApiResult<T> =
	| { ok: true; data: T; /** The aggregate version, for If-Match (NFR-13). */ etag?: string }
	| { ok: false; error: ApiError };

export interface RequestOptions {
	signal?: AbortSignal;
}

export interface SendOptions<T> extends RequestOptions {
	/** Sent as JSON. */
	body?: unknown;
	/** Sent as multipart/form-data instead, e.g. a dog with its photo. The browser sets the type. */
	form?: FormData;
	/** The ETag the edit is based on. A stale one gets a 412 `toe-beans/conflict`. */
	ifMatch?: string;
	/** Schema for the response body. Leave out for 204 No Content. */
	schema?: Schema<T>;
}

export interface ApiClient {
	get<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<ApiResult<T>>;
	send<T = undefined>(
		method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
		path: string,
		options?: SendOptions<T>
	): Promise<ApiResult<T>>;
}

/** A response body that breaks the API contract. A bug, so it's thrown, not returned. */
export class ContractError extends Error {
	override name = 'ContractError';
	constructor(
		readonly method: string,
		readonly path: string,
		override readonly cause: unknown
	) {
		super(`${method} ${path}: the response doesn't match its contract`);
	}
}

const REQUEST_ID_HEADER = 'x-request-id';

export function createApiClient(fetch: typeof globalThis.fetch, base = '/api/v1'): ApiClient {
	async function request<T>(
		method: string,
		path: string,
		schema: Schema<T> | undefined,
		{ body, form, ifMatch, signal }: SendOptions<T>
	): Promise<ApiResult<T>> {
		const headers: Record<string, string> = { accept: 'application/json' };
		if (body !== undefined && !form) headers['content-type'] = 'application/json';
		if (ifMatch !== undefined) headers['if-match'] = ifMatch;

		let response: Response;
		try {
			response = await fetch(`${base}${path}`, {
				method,
				headers,
				body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
				signal
			});
		} catch (error) {
			// The caller cancelled: let it see its own abort.
			if (signal?.aborted) throw error;
			return { ok: false, error: { kind: 'network' } };
		}

		const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
		if (!response.ok) return { ok: false, error: await toError(response, requestId) };

		const etag = response.headers.get('etag') ?? undefined;
		if (!schema) return { ok: true, data: undefined as T, etag };

		const parsed = schema.safeParse(await response.json().catch(() => undefined));
		if (!parsed.success) throw new ContractError(method, path, parsed.error);
		return { ok: true, data: parsed.data, etag };
	}

	return {
		get: (path, schema, options = {}) => request('GET', path, schema, options),
		send: (method, path, options = {}) => request(method, path, options.schema, options)
	};
}

async function toError(response: Response, requestId: string | undefined): Promise<ApiError> {
	if (response.headers.get('content-type')?.startsWith('application/problem+json')) {
		const parsed = Problem.safeParse(await response.json().catch(() => undefined));
		if (parsed.success) return { kind: 'problem', problem: parsed.data, requestId };
	}
	return { kind: 'http', status: response.status, requestId };
}
