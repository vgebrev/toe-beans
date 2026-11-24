// Nunito for the identity provider's login page, from our own address (backlog S19.2;
// #lib/server/sign-in-font.ts). The file is the build's own copy of the app's Latin Nunito.
import { read } from '$app/server';
import font from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import { backend } from '#lib/server/backend.js';
import { signInFontHeaders } from '#lib/server/sign-in-font.js';

export function GET() {
	return new Response(read(font).body, {
		headers: signInFontHeaders(backend().config.oidc.issuer)
	});
}
