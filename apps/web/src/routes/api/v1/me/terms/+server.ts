// Accepting the terms, which confirms the person is 18 or older (backlog S19.1). The version
// accepted must be the one the app serves now; hooks.server.ts lets this write through the gate.
import { terms } from '#lib/server/legal.js';
import { backend } from '#lib/server/backend.js';
import { jsonBody, toResponse, unauthenticated } from '#lib/server/respond.js';

export async function POST({ locals, request }) {
	if (!locals.viewer) return unauthenticated();
	return toResponse(
		await backend().http.account.acceptTerms(locals.viewer.auth, {
			body: await jsonBody(request),
			current: terms.version
		})
	);
}
