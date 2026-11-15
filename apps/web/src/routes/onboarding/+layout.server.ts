// First run (ui.md J1): signed in, and on the step that fits. Your name and Create household are
// for people without a household; Add your dog, the invite step and installing need one.
import { redirect } from '@sveltejs/kit';
import { safeReturnTo, signInPath } from '@toe-beans/backend';

export function load({ locals, url }) {
	if (!locals.viewer) redirect(303, signInPath(safeReturnTo(url.pathname)));
	const { member } = locals.viewer;
	const inHousehold = ['/onboarding/dog', '/onboarding/invite', '/onboarding/install'].includes(
		url.pathname
	);
	if (member && !inHousehold) redirect(303, '/');
	if (!member && inHousehold) redirect(303, '/onboarding');
	return {
		household: member && { name: member.householdName, timeZone: member.timeZone }
	};
}
