// The terms gate (backlog S19.1): pages that hold the household's data, or start someone on it,
// send a signed-in person who hasn't accepted the current terms to accept them first. A load's
// redirect works for full page loads and client-side navigation alike. API writes are refused in
// hooks.server.ts, so nothing a person adds comes before their agreement.
import { redirect } from '@sveltejs/kit';
import { needsTerms, safeReturnTo, type Viewer } from '@toe-beans/backend';
import { terms } from './legal.js';

export const AGREE_PATH = '/agree';

/** Where to accept the terms, coming back to `returnTo` afterwards. */
export function agreePath(returnTo: string): string {
	const back = safeReturnTo(returnTo);
	return back === '/' ? AGREE_PATH : `${AGREE_PATH}?returnTo=${encodeURIComponent(back)}`;
}

/**
 * Throws the redirect to accept the terms if `viewer` hasn't accepted the current ones, unless
 * `except(url)` says this page stays open. `url` is read only then: a load that reads it reruns
 * on every client-side navigation, which costs a round trip and fails offline.
 */
export function requireTerms(viewer: Viewer, url: URL, except?: (url: URL) => boolean): void {
	if (!needsTerms(viewer.termsVersion, terms.version) || except?.(url)) return;
	redirect(303, agreePath(url.pathname + url.search));
}
