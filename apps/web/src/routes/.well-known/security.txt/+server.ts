// Where to report a security problem (RFC 9116, backlog S17.3; #lib/server/security-txt.ts).
import { backend } from '#lib/server/backend.js';
import { securityTxt } from '#lib/server/security-txt.js';

const builtAt = new Date(__BUILT_AT__);

export function GET() {
	return new Response(securityTxt({ origin: backend().config.publicOrigin, builtAt }), {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'max-age=86400' }
	});
}
