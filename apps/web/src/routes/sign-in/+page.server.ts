// The Welcome step (ui.md J1). Already signed in: straight on to where the person was going.
import { redirect } from '@sveltejs/kit';
import { safeReturnTo } from '@toe-beans/backend';

export function load({ locals, url }) {
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
	if (locals.viewer) redirect(303, returnTo);
	const error = url.searchParams.get('error');
	return { returnTo, error: error === 'failed' || error === 'unverified' ? error : null };
}
