// The app's edge (architecture §8.4, D13, D32; backlog S14.1): a Cloudflare Worker on
// toebeans.co.za that forwards every request to the Cloud Run service, and sends www to the apex.
//
// fetch() to the run.app URL sets the Host header Cloud Run needs. Three headers go along, each set
// here and overwriting anything the client sent:
//   x-serverless-authorization  a Google ID token for toe-beans-edge (google-identity.js). Cloud
//                       Run lets in only its invokers, so going round the Worker to run.app is
//                       turned away by Google before the app sees it (D45, security audit R1).
//                       This header, not Authorization, so the client's own passes through.
//   x-toe-beans-proxy   the shared secret (PROXY_SECRET, a Worker secret); the app refuses any
//                       request without it, a second lock behind Google's
//   x-toe-beans-client  the phone's address (CF-Connecting-IP), which the app's rate limits key
//                       on through adapter-node's ADDRESS_HEADER (architecture §7)
//
// Cloudflare caches a Worker's fetches of .js files and icons by extension when the app sends no
// Cache-Control. The service worker's script never: Chrome's update check got the build
// before the deploy from Cloudflare's cache, so phones kept the old offline files for hours
// (S17.12). It also goes out as no-cache, in place of Cloudflare's 4-hour browser default.
//
// The spending cap (architecture D45, infra/spending-cap) takes the app down by taking this
// Worker's account off Cloud Run's invokers. Cloud Run then refuses the Worker's fetches itself,
// with a 403 that never reached the app, so it lacks the x-request-id every app response carries
// (hooks.server.ts). That refusal gets the maintenance page instead, so the cap needs no flag
// here and no Cloudflare credential in GCP. (A 404 without the header is read the same way, as it
// was from the internal-only ingress the cap first used.) Only /_app/ files can 404 without the
// app's header (adapter-node answers those), so they're left as they are. A 401 is different:
// Google didn't accept the token, which is a fault here, not the cap, so it gets a 502.
// The landing page (architecture D44, backlog S21): a GET of / without the app's session cookie
// gets the static page in assets/landing/ instead of the app, before a token is minted or Cloud
// Run is asked, so a visitor never wakes it and the first impression has no cold start. The cookie
// is only looked for by name, never checked: a stale one reaches the app, which clears it and
// sends the person to sign-in, which links back here. / with a query (the installed app's
// start_url, its shortcuts) always goes to the app.
//
// The maintenance page can't load anything from the app, which refuses everything while closed.
// The mark is bundled in from the app's own geometry, and the fonts are the Worker's static assets
// (assets/edge-fonts, served by Cloudflare before this runs; worker.test.js keeps them the app's).
import {
	markHeart,
	markLetters,
	markToes,
	markViewBox
} from '../../apps/web/src/lib/assets/brand/mark.ts';
import { idTokens } from './google-identity.js';

const WORKER_SCRIPT = '/service-worker.js';
const ORIGIN = 'https://toe-beans-1047834821273.africa-south1.run.app';
const APEX = 'toebeans.co.za';
const REQUEST_ID = 'x-request-id';
// The app's service worker shows a 503 as it is when it has this, rather than its own *Can't reach
// Toe Beans* (apps/web/src/lib/offline/caching.ts, MAINTENANCE_HEADER).
const MAINTENANCE = 'x-toe-beans-maintenance';

/** The app's session cookie (packages/backend/src/http/auth.ts, cookieSettings). */
const SESSION_COOKIE = '__Host-tb_session';
const LANDING = '/landing/';
/**
 * The hash of the landing page's one script, which applies the app's theme choice on this device
 * (ui.md §4.9). worker.test.js fails if the script changes without it.
 */
export const LANDING_THEME_SCRIPT = "'sha256-0SccVS3neAjw4ssByOinr10dkZ4YxTEbAvRku46s9Vc='";
/**
 * The landing page's headers, the app's own set (packages/backend/src/http/edge.ts) with a CSP for
 * a page whose only script is the theme's. Private and revalidated, as the same address serves the
 * app once signed in; HSTS comes from Cloudflare's zone (D32).
 */
const LANDING_HEADERS = {
	'cache-control': 'private, no-cache',
	vary: 'Cookie',
	'content-security-policy': `default-src 'none'; script-src ${LANDING_THEME_SCRIPT}; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
	'referrer-policy': 'same-origin',
	'x-content-type-options': 'nosniff',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()',
	'cross-origin-opener-policy': 'same-origin'
};

/** Who the Worker is to Google (infra/gcp/provision.sh, edge-key.mjs). None of it is secret. */
export const IDENTITY = {
	issuer: 'https://toebeans.co.za',
	subject: 'toe-beans-edge',
	provider:
		'projects/1047834821273/locations/global/workloadIdentityPools/cloudflare/providers/toe-beans-edge',
	serviceAccount: 'toe-beans-edge@toe-beans-co-za.iam.gserviceaccount.com',
	audience: ORIGIN
};

/** One per isolate, so the ID token is minted once an hour, not per request. */
let tokens = /** @type {ReturnType<typeof idTokens> | null} */ (null);
let tokensFor = '';

/** The isolate's token source for this key; a new key (a rotation) starts a new one. */
function tokenSource(/** @type {string} */ edgeKey) {
	if (!tokens || tokensFor !== edgeKey) {
		// The global looked up per call, not captured: tests stub it.
		tokens = idTokens({
			identity: IDENTITY,
			key: JSON.parse(edgeKey),
			fetch: (...a) => fetch(...a)
		});
		tokensFor = edgeKey;
	}
	return tokens;
}

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

/** A plain load of / by someone who isn't signed in on this browser. */
function wantsLanding(/** @type {Request} */ request, /** @type {URL} */ url) {
	if (url.pathname !== '/' || url.search !== '') return false;
	if (request.method !== 'GET' && request.method !== 'HEAD') return false;
	const cookies = (request.headers.get('cookie') ?? '').split(';');
	return !cookies.some((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE}=`));
}

/** The landing page from the Worker's static files, with its own headers only. */
async function landing(
	/** @type {Request} */ request,
	/** @type {URL} */ url,
	/** @type {{ fetch: (r: Request) => Promise<Response> }} */ assets
) {
	const page = await assets.fetch(
		new Request(new URL(LANDING, url), { method: request.method, headers: request.headers })
	);
	const headers = new Headers(LANDING_HEADERS);
	for (const name of ['content-type', 'content-length', 'etag', 'last-modified']) {
		const value = page.headers.get(name);
		if (value) headers.set(name, value);
	}
	return new Response(page.body, { status: page.status, headers });
}

/** The Worker couldn't get a token, or Google didn't take it: the app's own *Can't reach*. */
const unreachable = () =>
	new Response("Toe Beans can't reach its server\n", {
		status: 502,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});

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
	/** @param {Request} request @param {{ PROXY_SECRET: string, EDGE_KEY: string, ASSETS: { fetch: (r: Request) => Promise<Response> } }} env */
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.hostname !== APEX) {
			return Response.redirect(`https://${APEX}${url.pathname}${url.search}`, 301);
		}
		if (wantsLanding(request, url)) return landing(request, url, env.ASSETS);
		if (!env.PROXY_SECRET || !env.EDGE_KEY) return new Response('Not configured', { status: 500 });

		const source = tokenSource(env.EDGE_KEY);
		let token;
		try {
			token = await source.get();
		} catch {
			return unreachable();
		}
		const headers = new Headers(request.headers);
		headers.set('x-serverless-authorization', `Bearer ${token}`);
		headers.set('x-toe-beans-proxy', env.PROXY_SECRET);
		headers.set('x-toe-beans-client', request.headers.get('cf-connecting-ip') ?? '');
		const script = url.pathname === WORKER_SCRIPT;
		// Joined as text, never new URL(path, ORIGIN): a path starting // would resolve to another
		// host (//attacker.example/), and the token and secret above would go there with it.
		const response = await fetch(ORIGIN + url.pathname + url.search, {
			method: request.method,
			headers,
			body: request.body,
			// Redirects (sign-in, sign-out) go back to the phone as they are.
			redirect: 'manual',
			...(script && { cache: 'no-store' })
		});
		if (refusedByCloudRun(response, url.pathname)) return maintenance(request);
		if (response.status === 401 && !response.headers.has(REQUEST_ID)) {
			source.forget();
			return unreachable();
		}
		if (!script) return response;
		const fresh = new Response(response.body, response);
		fresh.headers.set('cache-control', 'no-cache');
		return fresh;
	}
};
