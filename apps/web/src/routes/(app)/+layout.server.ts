// Every destination needs a signed-in viewer (NFR-01). A redirect from a load works for both full
// page loads and client-side navigation.
import { redirect } from '@sveltejs/kit';
import { safeReturnTo, signInPath } from '@toe-beans/backend';

export function load({ locals, url }) {
	if (!locals.viewer) redirect(303, signInPath(safeReturnTo(url.pathname + url.search)));
	const { displayName, email } = locals.viewer;
	return { viewer: { displayName, email } };
}
