// The Welcome step (ui.md J1). Already signed in: straight on to where the person was going.
import { redirect } from '@sveltejs/kit';
import { safeReturnTo, type SignInError } from '@toe-beans/backend';

const errors = new Set<string | null>(['failed', 'unverified', 'too-many'] satisfies SignInError[]);

export function load({ locals, url }) {
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
	if (locals.viewer) redirect(303, returnTo);
	const error = url.searchParams.get('error');
	return { returnTo, error: errors.has(error) ? (error as SignInError) : null };
}
