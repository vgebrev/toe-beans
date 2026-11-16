// The backend's framework-neutral HttpResponse → a web Response, and what every API route reads
// the same way.
import { errorResponse, serializeCookie, type HttpResponse } from '@toe-beans/backend';

export function toResponse({
	status,
	headers,
	body,
	stream,
	cookies = []
}: HttpResponse): Response {
	const out = new Headers(headers);
	for (const cookie of cookies) out.append('set-cookie', serializeCookie(cookie));
	const payload = stream ?? (body === undefined ? null : JSON.stringify(body));
	return new Response(payload, { status, headers: out });
}

/** The 401 for an API call without a session (architecture §3.4). */
export const unauthenticated = (): Response =>
	toResponse(errorResponse({ kind: 'unauthenticated' }));

/** The JSON body, or undefined when there's none or it can't be read: the contract then says why. */
export const jsonBody = (request: Request): Promise<unknown> =>
	request.json().catch(() => undefined);
