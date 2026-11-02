// Starts a sign-in: off to the identity provider (architecture §3.4). `returnTo` is checked by the
// backend, so it can't send anyone to another site.
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function GET({ url, getClientAddress }) {
	return toResponse(
		await backend().http.auth.signIn({
			returnTo: url.searchParams.get('returnTo'),
			prompt: url.searchParams.get('prompt'),
			clientAddress: getClientAddress()
		})
	);
}
