// The browser's error reports, sent on to Sentry from here (architecture D41): ad blockers block
// Sentry's own hosts, never the app's origin. The path is `ERROR_RELAY_PATH`.
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ request, getClientAddress }) {
	return toResponse(
		await backend().http.errorRelay.relay({
			clientAddress: getClientAddress(),
			contentLength: request.headers.get('content-length'),
			readBody: async () => new Uint8Array(await request.arrayBuffer())
		})
	);
}
