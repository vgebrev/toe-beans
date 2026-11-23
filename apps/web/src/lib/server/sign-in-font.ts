// The font of the identity provider's login page (backlog S19.2; runbook auth0.md §5). Auth0's
// theme takes one font URL, and Google Fonts would see every visitor's address, so the app serves
// Nunito's Latin file at a fixed address and lets only the login page's origin load it.

/** Where the Auth0 theme points. Fixed, unlike the build's hashed copy, so the theme never changes. */
export const SIGN_IN_FONT_PATH = '/fonts/nunito-latin.woff2';

/**
 * The response headers: CORS for the issuer's origin alone (a font from another origin needs it),
 * and a day's caching, as the file under this address changes when the font package does.
 */
export function signInFontHeaders(issuer: string): Record<string, string> {
	return {
		'content-type': 'font/woff2',
		'access-control-allow-origin': new URL(issuer).origin,
		'cache-control': 'public, max-age=86400'
	};
}
