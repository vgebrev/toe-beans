import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { icons } from '../../apps/web/src/lib/components/icon/icons.ts';
import { markHeart, markLetters } from '../../apps/web/src/lib/assets/brand/mark.ts';
import { tokens } from '../../apps/web/src/lib/theme/tokens.ts';
import { createHash } from 'node:crypto';
import { THEME_STORAGE_KEY } from '../../apps/web/src/lib/client/theme.ts';
import worker, { LANDING_THEME_SCRIPT } from './worker.js';

const ORIGIN = 'https://toe-beans-1047834821273.africa-south1.run.app';

const { privateKey } = await crypto.subtle.generateKey(
	{
		name: 'RSASSA-PKCS1-v1_5',
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: 'SHA-256'
	},
	true,
	['sign']
);
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const ID_TOKEN = `h.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.s`;

// A new key ID per test, so each starts without the isolate's kept token.
let keys = 0;
const ASSET_DIR = new URL('assets/', import.meta.url);
/** What Cloudflare's static files give the Worker: the file, with headers it must not pass on. */
const assets = {
	seen: /** @type {Request[]} */ ([]),
	async fetch(/** @type {Request} */ request) {
		assets.seen.push(request);
		const path = new URL(request.url).pathname;
		const file = new URL(path.slice(1) + (path.endsWith('/') ? 'index.html' : ''), ASSET_DIR);
		if (!existsSync(file)) return new Response('Not found', { status: 404 });
		return new Response(request.method === 'HEAD' ? null : readFileSync(file), {
			headers: {
				'content-type': 'text/html; charset=utf-8',
				etag: '"v1"',
				'cache-control': 'public, max-age=86400',
				'x-robots-tag': 'noindex'
			}
		});
	}
};

/** @type {{ PROXY_SECRET: string, EDGE_KEY: string, ASSETS: typeof assets }} */
let env;
beforeEach(() => {
	assets.seen = [];
	env = {
		PROXY_SECRET: 's3cret',
		EDGE_KEY: JSON.stringify({ ...jwk, kid: `k${++keys}` }),
		ASSETS: assets
	};
});

/**
 * Stubs the Worker's fetches: Google's token exchange (refused with `google`'s status, if given)
 * and the origin, which gives one answer. Records the origin requests and counts the exchanges.
 */
function origin(/** @type {Response} */ answer, { google = 200 } = {}) {
	const seen = /** @type {{ url: string, headers: Headers }[]} */ ([]);
	const exchanges = { count: 0 };
	vi.stubGlobal(
		'fetch',
		vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
			// Whole origins compared, not prefixes (CodeQL js/incomplete-url-substring-sanitization).
			const to = new URL(url);
			if (to.origin !== ORIGIN) {
				exchanges.count++;
				if (google !== 200) return new Response('{}', { status: google });
				return to.origin === 'https://sts.googleapis.com'
					? Response.json({ access_token: 'federated' })
					: Response.json({ token: ID_TOKEN });
			}
			seen.push({ url, headers: new Headers(init.headers) });
			return answer.clone();
		})
	);
	return Object.assign(seen, { exchanges });
}

const get = (/** @type {string} */ path, /** @type {Record<string, string>} */ headers = {}) =>
	worker.fetch(new Request(`https://toebeans.co.za${path}`, { headers }), env);

/** An answer from the app, which always names the request. */
const fromApp = (/** @type {number} */ status) =>
	new Response('app', { status, headers: { 'x-request-id': 'r1' } });

/** Cloud Run turning the request away before the app. */
const refused = (/** @type {number} */ status = 404) =>
	new Response('<html>Error: Page not found</html>', {
		status,
		headers: { 'content-type': 'text/html' }
	});

afterEach(() => vi.unstubAllGlobals());

describe('the edge Worker', () => {
	it('forwards to Cloud Run with the proxy secret, joining the path as text', async () => {
		const seen = origin(fromApp(200));
		const response = await get('//attacker.example/x?y=1', { 'x-toe-beans-proxy': 'forged' });
		expect(response.status).toBe(200);
		expect(seen[0].url).toBe(`${ORIGIN}//attacker.example/x?y=1`);
		expect(seen[0].headers.get('x-toe-beans-proxy')).toBe('s3cret');
	});

	describe("Google's invoker check (D45, security audit R1)", () => {
		it("sends the Worker's ID token, leaving the client's Authorization alone", async () => {
			const seen = origin(fromApp(200));
			await get('/internal/tick', {
				authorization: 'Bearer from-the-client',
				'x-serverless-authorization': 'Bearer forged'
			});
			expect(seen[0].headers.get('x-serverless-authorization')).toBe(`Bearer ${ID_TOKEN}`);
			expect(seen[0].headers.get('authorization')).toBe('Bearer from-the-client');
		});

		it('mints the token once for many requests', async () => {
			const seen = origin(fromApp(200));
			await Promise.all([get('/plan'), get('/today'), get('/api/v1/me')]);
			await get('/dogs');
			expect(seen.exchanges.count).toBe(2);
		});

		it("answers 502, not the paused page, when Google won't issue a token", async () => {
			const seen = origin(fromApp(200), { google: 403 });
			const response = await get('/plan', { accept: 'text/html' });
			expect(response.status).toBe(502);
			expect(response.headers.get('x-toe-beans-maintenance')).toBeNull();
			expect(seen).toHaveLength(0);
		});

		it('answers 502 when Cloud Run rejects the token, and mints a new one next time', async () => {
			const seen = origin(refused(401));
			const response = await get('/plan', { accept: 'text/html' });
			expect(response.status).toBe(502);
			expect(response.headers.get('x-toe-beans-maintenance')).toBeNull();
			await get('/plan');
			expect(seen.exchanges.count).toBe(4);
		});

		it('refuses to run without its key', async () => {
			origin(fromApp(200));
			const response = await worker.fetch(new Request('https://toebeans.co.za/plan'), {
				...env,
				EDGE_KEY: ''
			});
			expect(response.status).toBe(500);
		});
	});

	it("passes the app's own 404s and 403s through", async () => {
		origin(fromApp(404));
		expect(await (await get('/nope', { accept: 'text/html' })).text()).toBe('app');
		origin(fromApp(403));
		expect((await get('/api/v1/me')).status).toBe(403);
	});

	describe('while the spending cap holds (D45)', () => {
		it.each([404, 403])('shows the maintenance page when Cloud Run refuses with %i', async (s) => {
			origin(refused(s));
			const response = await get('/plan', { accept: 'text/html,application/xhtml+xml' });
			expect(response.status).toBe(503);
			expect(response.headers.get('x-toe-beans-maintenance')).toBe('1');
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(response.headers.get('content-type')).toMatch(/^text\/html/);
			expect(await response.text()).toContain('Toe Beans is paused');
		});

		it("draws the app's mark and loads the app's fonts from the Worker's own files", async () => {
			origin(refused(403));
			const response = await get('/plan', { accept: 'text/html' });
			const html = await response.text();
			expect(html).toContain(`fill-rule="evenodd" d="${markLetters}"`);
			expect(html).toContain(`d="${markHeart}"`);
			expect(html.match(/<ellipse /g)).toHaveLength(4);
			expect(response.headers.get('content-security-policy')).toContain("font-src 'self'");
			const fonts = [...html.matchAll(/url\(\/(edge-fonts\/[^)]+)\)/g)].map((m) => m[1]);
			expect(fonts).toEqual(['edge-fonts/nunito-latin.woff2', 'edge-fonts/fredoka-latin.woff2']);
		});

		it.each([
			['nunito-latin.woff2', 'nunito/files/nunito-latin-wght-normal.woff2'],
			['fredoka-latin.woff2', 'fredoka/files/fredoka-latin-wght-normal.woff2']
		])("serves %s as the app's own copy of the font", (file, source) => {
			const ours = readFileSync(new URL(`assets/edge-fonts/${file}`, import.meta.url));
			const app = readFileSync(
				new URL(`../../apps/web/node_modules/@fontsource-variable/${source}`, import.meta.url)
			);
			expect(ours.equals(app), `copy ${source} over ${file}`).toBe(true);
		});

		it('answers API calls in plain text, which the app reads as unreachable', async () => {
			origin(refused());
			const response = await get('/api/v1/dogs', { accept: 'application/json' });
			expect(response.status).toBe(503);
			expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
		});

		it('leaves a missing build file as it is', async () => {
			origin(refused());
			expect((await get('/_app/immutable/old.js')).status).toBe(404);
		});
	});

	it('sends www to the apex', async () => {
		const response = await worker.fetch(new Request('https://www.toebeans.co.za/a?b=1'), env);
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('https://toebeans.co.za/a?b=1');
	});

	describe('the landing page at / (D44, S21)', () => {
		const SESSION = '__Host-tb_session';

		it('serves the static page to a visitor, without asking Google or Cloud Run', async () => {
			const seen = origin(fromApp(200));
			const response = await get('/', { accept: 'text/html' });
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('Raise your puppy together.');
			expect(seen).toHaveLength(0);
			expect(seen.exchanges.count).toBe(0);
			expect(new URL(assets.seen[0].url).pathname).toBe('/landing/');
		});

		it('sends its own headers: private, varying on the cookie, only the theme script, indexable', async () => {
			origin(fromApp(200));
			const headers = (await get('/')).headers;
			expect(headers.get('cache-control')).toBe('private, no-cache');
			expect(headers.get('vary')).toBe('Cookie');
			expect(headers.get('etag')).toBe('"v1"');
			expect(headers.get('x-robots-tag')).toBeNull();
			const csp = headers.get('content-security-policy');
			expect(csp).toContain("default-src 'none'");
			expect(csp?.match(/script-src ([^;]+);/)?.[1]).toBe(LANDING_THEME_SCRIPT);
			expect(csp).not.toContain('unsafe');
			expect(headers.get('x-content-type-options')).toBe('nosniff');
		});

		it('answers HEAD too', async () => {
			origin(fromApp(200));
			const response = await worker.fetch(
				new Request('https://toebeans.co.za/', { method: 'HEAD' }),
				env
			);
			expect(response.status).toBe(200);
			expect(assets.seen[0].method).toBe('HEAD');
		});

		it.each([
			['the session cookie', { cookie: `${SESSION}=abc` }],
			['the session cookie among others', { cookie: `theme=dark; ${SESSION}=abc; x=1` }]
		])('sends someone with %s to the app', async (_, headers) => {
			const seen = origin(fromApp(200));
			await get('/', headers);
			expect(seen).toHaveLength(1);
			expect(assets.seen).toHaveLength(0);
		});

		it.each([`x${SESSION}=1`, `${SESSION}_old=1`, `other=${SESSION}=1`])(
			'still shows the page for a cookie that only looks like it (%s)',
			async (cookie) => {
				const seen = origin(fromApp(200));
				await get('/', { cookie });
				expect(seen).toHaveLength(0);
			}
		);

		it('leaves / with a query (the installed app, its shortcuts) and other methods to the app', async () => {
			const seen = origin(fromApp(200));
			await get('/?source=pwa');
			await get('/?add=log');
			await worker.fetch(new Request('https://toebeans.co.za/', { method: 'POST' }), env);
			expect(seen).toHaveLength(3);
			expect(assets.seen).toHaveLength(0);
		});

		describe('the page itself', () => {
			/** Markup with Prettier's line breaks folded, so it compares as written. */
			const fold = (/** @type {string} */ markup) =>
				markup
					.replace(/\s+/g, ' ')
					.replace(/\s*>\s*/g, '>')
					.replace(/\s*</g, '<');
			const html = fold(readFileSync(new URL('landing/index.html', ASSET_DIR), 'utf8'));
			const css = readFileSync(new URL('landing/landing.css', ASSET_DIR), 'utf8');
			const kebab = (/** @type {string} */ k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
			/** An icon as <Icon> draws it, as markup. */
			const svg = (
				/** @type {import('../../apps/web/src/lib/components/icon/icons.ts').IconSvgElement} */ icon
			) =>
				icon
					.map(
						([tag, attributes]) =>
							`<${tag} ${Object.entries(attributes)
								.filter(([k]) => k !== 'key')
								.map(([k, v]) => `${kebab(k)}="${v}"`)
								.join(' ')}></${tag}>`
					)
					.join('');

			it("draws the app's mark", () => {
				expect(html.split(`fill-rule="evenodd" d="${markLetters}"`)).toHaveLength(3);
				expect(html).toContain(`d="${markHeart}"`);
			});

			it.each(['outcome-successful', 'outcome-partial', 'outcome-not-yet', 'outcome-not-assessed'])(
				"shows the app's own %s icon",
				(name) => {
					expect(html).toContain(fold(svg(icons[/** @type {keyof typeof icons} */ (name)])));
				}
			);

			it("uses the app's colours", () => {
				const declared = [...css.matchAll(/--tb-([a-z-]+): light-dark\((#\w+), (#\w+)\)/g)];
				expect(declared.length).toBeGreaterThan(10);
				for (const [, name, light, dark] of declared) {
					const token = tokens[/** @type {keyof typeof tokens} */ (name)];
					expect(token, name).toBeDefined();
					expect([light, dark], name).toEqual([
						token.light.toLowerCase(),
						token.dark.toLowerCase()
					]);
				}
			});

			it("uses the app's favicon", () => {
				const ours = readFileSync(new URL('landing/favicon.svg', ASSET_DIR));
				const app = readFileSync(
					new URL('../../apps/web/src/lib/assets/brand/favicon.svg', import.meta.url)
				);
				expect(ours.equals(app)).toBe(true);
			});

			it('loads nothing from the app or anywhere else, only its own files', () => {
				const loaded = [
					...[...html.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]),
					...[...html.matchAll(/<link [^>]*href="([^"]+)"/g)].map((m) => m[1]),
					...[...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1])
				].filter((url) => url !== 'https://toebeans.co.za/');
				expect(loaded.length).toBeGreaterThan(8);
				for (const url of loaded) {
					expect(url, url).toMatch(/^\/(landing|edge-fonts)\//);
					expect(existsSync(new URL(url.slice(1), ASSET_DIR)), url).toBe(true);
				}
				// Scripts: the next test.
				expect(html).not.toMatch(/\sstyle="|\son[a-z]+="/);
			});

			it("has one script, the app's theme choice, allowed by its hash", () => {
				const raw = readFileSync(new URL('landing/index.html', ASSET_DIR), 'utf8');
				// Cut out by position, not a regex (CodeQL js/bad-tag-filter): any spelling of an
				// opening tag counts, and the one there is must be a bare <script> with no src.
				expect(raw.toLowerCase().split('<script')).toHaveLength(2);
				const start = raw.indexOf('<script>') + '<script>'.length;
				const end = raw.indexOf('</script>', start);
				expect(start).toBeGreaterThan('<script>'.length - 1);
				expect(end).toBeGreaterThan(start);
				const script = raw.slice(start, end);
				const hash = createHash('sha256').update(script).digest('base64');
				expect(LANDING_THEME_SCRIPT).toBe(`'sha256-${hash}'`);
				const headers = readFileSync(new URL('_headers', ASSET_DIR), 'utf8');
				expect(headers).toContain(`script-src ${LANDING_THEME_SCRIPT};`);
				expect(script).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
				expect(script).toContain(`theme === 'dark' ? '${tokens.bg.dark}' : '${tokens.bg.light}'`);
			});

			it('has a title, a description and a share card for link previews (S21.3)', () => {
				expect(html).toContain('<title>Toe Beans: puppy training and care, shared</title>');
				expect(html).toMatch(/<meta name="description" content="[^"]{80,160}"/);
				const meta = (/** @type {string} */ property) =>
					html.match(new RegExp(`<meta property="${property}" content="([^"]+)"`))?.[1];
				expect(meta('og:url')).toBe('https://toebeans.co.za/');
				const image = meta('og:image') ?? '';
				expect(image).toBe('https://toebeans.co.za/landing/share.png');
				const png = readFileSync(new URL(new URL(image).pathname.slice(1), ASSET_DIR));
				expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
				expect([meta('og:image:width'), meta('og:image:height')]).toEqual(['1200', '630']);
				expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
			});

			it('links only to the page itself and the app’s public ways in', () => {
				const links = new Set([...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]));
				expect([...links].sort()).toEqual(
					['#household', '#how', '/', '/auth/sign-in', '/privacy', '/terms'].sort()
				);
			});
		});
	});

	describe('robots.txt and the sitemap (S21.3)', () => {
		const robots = readFileSync(new URL('robots.txt', ASSET_DIR), 'utf8');
		const sitemap = readFileSync(new URL('sitemap.xml', ASSET_DIR), 'utf8');

		it('lists the public pages, and only those', () => {
			const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
			expect(pages).toEqual([
				'https://toebeans.co.za/',
				'https://toebeans.co.za/terms',
				'https://toebeans.co.za/privacy'
			]);
		});

		it('points crawlers at the sitemap and keeps them off the API, sign-in and invite links', () => {
			expect(robots).toContain('Sitemap: https://toebeans.co.za/sitemap.xml');
			const disallowed = [...robots.matchAll(/^Disallow: (.*)$/gm)].map((m) => m[1]);
			expect(disallowed).toEqual(['/api/', '/auth/', '/internal/', '/join/']);
		});
	});
});
