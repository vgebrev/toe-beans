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
//
// The spending cap (architecture D45, infra/spending-cap) takes the app down by taking allUsers off
// Cloud Run's invokers. Cloud Run then refuses this Worker's fetches itself, with a 403 (or a 404
// from an internal-only ingress) that never reached the app, so it lacks the x-request-id every app response carries
// (hooks.server.ts). That refusal gets the maintenance page instead, so the cap needs no flag
// here and no Cloudflare credential in GCP. Only /_app/ files can 404 without the app's header
// (adapter-node answers those), so they're left as they are.
// The maintenance page can't load anything from the app, which refuses everything while closed.
// The mark is bundled in from the app's own geometry, and the fonts are the Worker's static assets
// (assets/edge-fonts, served by Cloudflare before this runs; worker.test.js keeps them the app's).
import {
	markHeart,
	markLetters,
	markToes,
	markViewBox
} from '../../apps/web/src/lib/assets/brand/mark.ts';

const WORKER_SCRIPT = '/service-worker.js';
const ORIGIN = 'https://toe-beans-1047834821273.africa-south1.run.app';
const APEX = 'toebeans.co.za';
const REQUEST_ID = 'x-request-id';
// The app's service worker shows a 503 as it is when it has this, rather than its own *Can't reach
// Toe Beans* (apps/web/src/lib/offline/caching.ts, MAINTENANCE_HEADER).
const MAINTENANCE = 'x-toe-beans-maintenance';

/** Cloud Run turned the request away before the app saw it: the cap has closed it. */
const refusedByCloudRun = (/** @type {Response} */ response, /** @type {string} */ path) =>
	(response.status === 404 || response.status === 403) &&
	!response.headers.has(REQUEST_ID) &&
	!path.startsWith('/_app/');

/** The mark as Logo.svelte draws it: letters in the text's colour, beans in the brand tan. */
const mark = `<svg viewBox="0 0 ${markViewBox.width} ${markViewBox.height}" role="img" aria-label="Toe Beans">
	<path fill="currentColor" fill-rule="evenodd" d="${markLetters}"/>
	<g fill="#C98A4B"><path d="${markHeart}"/>${markToes.map((t) => `<ellipse cx="${t.cx}" cy="${t.cy}" rx="${t.rx}" ry="${t.ry}" transform="rotate(${t.deg} ${t.cx} ${t.cy})"/>`).join('')}</g>
</svg>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Toe Beans is paused</title>
<style>
	@font-face {
		font-family: 'Nunito Variable'; font-style: normal; font-display: swap; font-weight: 200 1000;
		src: url(/edge-fonts/nunito-latin.woff2) format('woff2-variations');
	}
	@font-face {
		font-family: 'Fredoka Variable'; font-style: normal; font-display: swap; font-weight: 300 700;
		src: url(/edge-fonts/fredoka-latin.woff2) format('woff2-variations');
	}
	:root { --bg: #fffbf5; --text: #2b1d14; --muted: #6b5444; --mark: #8a4b1f; }
	@media (prefers-color-scheme: dark) {
		:root { --bg: #141110; --text: #f3eadf; --muted: #b5a493; --mark: #f3eadf; }
	}
	html, body { height: 100%; margin: 0; }
	body {
		display: grid; place-items: center; padding: 16px; box-sizing: border-box;
		background: var(--bg); color: var(--text); text-align: center;
		font: 1.0625rem/1.5 'Nunito Variable', system-ui, sans-serif;
	}
	main { max-width: 28rem; }
	svg { width: 68px; height: 72px; color: var(--mark); }
	h1 {
		margin: 16px 0 8px; font: 700 1.75rem/1.25 'Fredoka Variable', 'Nunito Variable', system-ui,
			sans-serif;
	}
	p { margin: 0 0 12px; color: var(--muted); }
</style>
</head>
<body>
<main>
	${mark}
	<h1>Toe Beans is paused</h1>
	<p>We've stopped the app for a while to look into something on our side. Your records are safe, and nothing you saved is lost.</p>
	<p>Reminders are paused too. Please check back later; questions to support@toebeans.co.za.</p>
</main>
</body>
</html>`;

/** In place of the app while the cap holds: a page for a browser, plain text for anything else. */
function maintenance(/** @type {Request} */ request) {
	const html = (request.headers.get('accept') ?? '').includes('text/html');
	return new Response(html ? page : 'Toe Beans is paused\n', {
		status: 503,
		headers: {
			'content-type': html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
			'cache-control': 'no-store',
			'retry-after': '3600',
			'x-robots-tag': 'noindex',
			'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'",
			[MAINTENANCE]: '1'
		}
	});
}

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
		// Joined as text, never new URL(path, ORIGIN): a path starting // would resolve to another
		// host (//attacker.example/), and the secret above would go there with the request.
		const response = await fetch(ORIGIN + url.pathname + url.search, {
			method: request.method,
			headers,
			body: request.body,
			// Redirects (sign-in, sign-out) go back to the phone as they are.
			redirect: 'manual',
			...(script && { cache: 'no-store' })
		});
		if (refusedByCloudRun(response, url.pathname)) return maintenance(request);
		if (!script) return response;
		const fresh = new Response(response.body, response);
		fresh.headers.set('cache-control', 'no-cache');
		return fresh;
	}
};
