// Someone signed in accepts the terms before joining a household (backlog S19.1). Signed out, the
// page still says what the invitation is for, and signing in brings them back here.
import { requireTerms } from '#lib/server/terms.js';

export function load({ locals, url }) {
	if (locals.viewer) requireTerms(locals.viewer, url);
}
