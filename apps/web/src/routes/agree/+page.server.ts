// Accepting the terms, with the age confirmation (backlog S19.1, ui.md J1). The gate in the app,
// onboarding and join loads sends people here; once they've accepted, straight on.
import { redirect } from '@sveltejs/kit';
import { needsTerms, safeReturnTo, signInPath } from '@toe-beans/backend';
import { terms } from '#lib/server/legal.js';

export function load({ locals, url }) {
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
	if (!locals.viewer) redirect(303, signInPath(safeReturnTo(url.pathname + url.search)));
	const { termsVersion, member } = locals.viewer;
	if (!needsTerms(termsVersion, terms.version)) redirect(303, returnTo);
	return {
		returnTo,
		version: terms.version,
		updated: terms.updated,
		/** `new`: starting out; `member`: in a household from before the terms were asked for; `updated`: accepted older terms. */
		reason: termsVersion ? 'updated' : member ? 'member' : 'new'
	} as const;
}
