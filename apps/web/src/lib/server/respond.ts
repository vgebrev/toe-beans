// The backend's framework-neutral HttpResponse → a web Response.
import { serializeCookie, type HttpResponse } from '@toe-beans/backend';

export function toResponse({ status, headers, body, cookies = [] }: HttpResponse): Response {
	const out = new Headers(headers);
	for (const cookie of cookies) out.append('set-cookie', serializeCookie(cookie));
	return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: out });
}
