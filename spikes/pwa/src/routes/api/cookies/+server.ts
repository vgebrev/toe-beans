// S-1.4a: which cookies survive each proxy, and which host the server thinks it is serving.
// Firebase Hosting forwards only `__session`; Cloudflare should forward everything.
import { json, type RequestHandler } from '@sveltejs/kit';

const attrs = 'Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600';

export const GET: RequestHandler = ({ request, url }) => {
	const h = (n: string) => request.headers.get(n);
	return json(
		{
			received: (h('cookie') ?? '')
				.split(';')
				.map((c) => c.trim().split('=')[0])
				.filter(Boolean),
			urlOrigin: url.origin,
			host: h('host'),
			xForwardedHost: h('x-forwarded-host'),
			xForwardedProto: h('x-forwarded-proto'),
			viaWorker: h('x-toe-beans-edge')
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};

// Sets the three candidates; the page then GETs to see which came back.
export const POST: RequestHandler = () => {
	const headers = new Headers({ 'cache-control': 'no-store' });
	for (const name of ['__Host-probe', '__session', 'probe-plain'])
		headers.append('set-cookie', `${name}=1; ${attrs}`);
	return new Response(null, { status: 204, headers });
};
