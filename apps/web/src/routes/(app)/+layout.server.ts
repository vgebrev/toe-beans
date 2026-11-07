// Every destination needs a signed-in viewer (NFR-01) with a household to show (FR-01). A redirect
// from a load works for both full page loads and client-side navigation.
import { redirect } from '@sveltejs/kit';
import { safeReturnTo, signInPath } from '@toe-beans/backend';

export function load({ locals, url }) {
	if (!locals.viewer) redirect(303, signInPath(safeReturnTo(url.pathname + url.search)));
	const { displayName, email, member } = locals.viewer;
	if (!member) redirect(303, '/onboarding');
	const { householdName, timeZone, role } = member;
	return { viewer: { displayName, email }, household: { name: householdName, timeZone, role } };
}
