// Ends the session, then signs out at the identity provider too, so the next sign-in can choose
// another account (architecture §3.4). POST only, so another site can't sign anyone out.
import { backend } from '#lib/server/backend.js';
import { toResponse } from '#lib/server/respond.js';

export async function POST({ cookies }) {
	return toResponse(await backend().http.auth.signOut({ cookie: (name) => cookies.get(name) }));
}
