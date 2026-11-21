// The app's edge (architecture §8.4, D13, D32; backlog S14.1): a Cloudflare Worker on
// toebeans.co.za that forwards every request to the Cloud Run service, and sends www to the apex.
//
// fetch() to the run.app URL sets the Host header Cloud Run needs. Two headers go along, each set
// here and overwriting anything the client sent:
//   x-toe-beans-proxy   the shared secret (PROXY_SECRET, a Worker secret); the app refuses any
//                       request without it, so going round the Worker to run.app gets a 403
//   x-toe-beans-client  the phone's address (CF-Connecting-IP), which the app's rate limits key
//                       on through adapter-node's ADDRESS_HEADER (architecture §7)
//
// Cloudflare caches a Worker's fetches of .js files and icons by extension when the app sends no
// Cache-Control. The service worker's script never: Chrome's update check got the build
// before the deploy from Cloudflare's cache, so phones kept the old offline files for hours
// (S17.12). It also goes out as no-cache, in place of Cloudflare's 4-hour browser default.
const WORKER_SCRIPT = '/service-worker.js';
const ORIGIN = 'https://toe-beans-1047834821273.africa-south1.run.app';
const APEX = 'toebeans.co.za';

export default {
	/** @param {Request} request @param {{ PROXY_SECRET: string }} env */
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.hostname !== APEX) {
			return Response.redirect(`https://${APEX}${url.pathname}${url.search}`, 301);
		}
		if (!env.PROXY_SECRET) return new Response('Not configured', { status: 500 });

		const headers = new Headers(request.headers);
		headers.set('x-toe-beans-proxy', env.PROXY_SECRET);
		headers.set('x-toe-beans-client', request.headers.get('cf-connecting-ip') ?? '');
		const script = url.pathname === WORKER_SCRIPT;
		const response = await fetch(new URL(url.pathname + url.search, ORIGIN), {
			method: request.method,
			headers,
			body: request.body,
			// Redirects (sign-in, sign-out) go back to the phone as they are.
			redirect: 'manual',
			...(script && { cache: 'no-store' })
		});
		if (!script) return response;
		const fresh = new Response(response.body, response);
		fresh.headers.set('cache-control', 'no-cache');
		return fresh;
	}
};
