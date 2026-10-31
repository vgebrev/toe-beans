// The backend's framework-neutral HttpResponse → a web Response.
import type { HttpResponse } from '@toe-beans/backend';

export const toResponse = ({ status, headers, body }: HttpResponse): Response =>
	new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
