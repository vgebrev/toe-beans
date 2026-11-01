// Sign-in, callback, sign-out and per-request authentication as framework-neutral handlers
// (architecture §3.4). The host passes cookie values and query strings in, and applies the
// redirects and cookies that come back.
import type { Auth, Viewer } from '../application/auth/auth.js';
import { SIGN_IN_TTL_MS } from '../application/auth/auth.js';
import { problem, redirect, type HttpResponse, type SetCookie } from './response.js';

export interface AuthHttpOptions {
	/** The public origin, e.g. `https://toebeans.co.za`. */
	publicOrigin: string;
}

export const CALLBACK_PATH = '/auth/callback';
export const SIGN_IN_PAGE = '/sign-in';

export type CookieReader = (name: string) => string | undefined;

/**
 * Cookie names and flags for an origin. `Secure` cookies aren't kept over plain http (except on
 * localhost), so an http origin such as a dev server on the LAN gets unprefixed, non-Secure
 * cookies; config refuses http in prod.
 */
export function cookieSettings(publicOrigin: string) {
	const secure = publicOrigin.startsWith('https:');
	const prefix = secure ? '__Host-' : '';
	return { secure, session: `${prefix}tb_session`, signIn: `${prefix}tb_signin` };
}

/**
 * Where to go after signing in: a path on our own origin, or `/`. Anything that could leave the
 * origin (`//host`, `/\host`, a scheme) or loop back into sign-in is replaced, so the parameter
 * can't be used as an open redirect.
 */
export function safeReturnTo(value: string | null | undefined): string {
	if (!value || value.length > 2000 || !value.startsWith('/')) return '/';
	// Browsers drop tabs and newlines from URLs, which can turn `/\t/host` into `//host`.
	if ([...value].some((c) => c.charCodeAt(0) < 0x20 || c === '\u007f')) return '/';
	const base = 'https://origin.invalid';
	let url: URL;
	try {
		url = new URL(value, base);
	} catch {
		return '/';
	}
	if (url.origin !== base) return '/';
	if (url.pathname === SIGN_IN_PAGE || url.pathname.startsWith('/auth/')) return '/';
	return url.pathname + url.search + url.hash;
}

/** The sign-in page, coming back to `returnTo` afterwards. */
export function signInPath(returnTo: string, error?: 'failed' | 'unverified'): string {
	const params = new URLSearchParams();
	if (error) params.set('error', error);
	if (returnTo !== '/') params.set('returnTo', returnTo);
	const query = params.toString();
	return query ? `${SIGN_IN_PAGE}?${query}` : SIGN_IN_PAGE;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface AuthHttp {
	/** `GET /auth/sign-in`: off to the provider. */
	signIn(input: { returnTo: string | null; prompt: string | null }): Promise<HttpResponse>;
	/** `GET /auth/callback`: back from the provider. `search` is the request's query string. */
	callback(input: { search: string; cookie: CookieReader }): Promise<HttpResponse>;
	/** `POST /auth/sign-out`. */
	signOut(input: { cookie: CookieReader }): Promise<HttpResponse>;
	/**
	 * The viewer for this request, or null. `cookies` renews or clears the session cookie, and the
	 * host must set them on the response.
	 */
	authenticate(cookie: CookieReader): Promise<{ viewer: Viewer | null; cookies: SetCookie[] }>;
	/**
	 * Refuses a state-changing request from another origin (CSRF, architecture §3.4). Returns the
	 * 403 to send, or null to carry on.
	 */
	checkOrigin(input: {
		method: string;
		origin: string | null;
		fetchSite: string | null;
	}): HttpResponse | null;
}

export function createAuthHttp(auth: Auth, { publicOrigin }: AuthHttpOptions): AuthHttp {
	const names = cookieSettings(publicOrigin);
	const cookie = (name: string, value: string, maxAge: number): SetCookie => ({
		name,
		value,
		maxAge: Math.max(0, Math.floor(maxAge)),
		secure: names.secure,
		sameSite: 'lax'
	});
	const clear = (name: string) => cookie(name, '', 0);
	const sessionCookie = (token: string, expiresAt: Date) =>
		cookie(names.session, token, (expiresAt.getTime() - Date.now()) / 1000);

	return {
		async signIn({ returnTo, prompt }) {
			const { url, handle } = await auth.startSignIn({
				returnTo: safeReturnTo(returnTo),
				...(prompt === 'login' && { prompt: 'login' as const })
			});
			// SameSite=Lax still reaches the callback: it's a top-level GET navigation.
			return redirect(url, [cookie(names.signIn, handle, SIGN_IN_TTL_MS / 1000)]);
		},

		async callback({ search, cookie: read }) {
			// Built on the public origin, not the request's: behind the Cloudflare Worker the
			// server sees the run.app host, and this URL is also the redirect_uri (§8.4).
			const callbackUrl = new URL(CALLBACK_PATH + search, publicOrigin);
			const result = await auth.finishSignIn({
				callbackUrl,
				handle: read(names.signIn),
				previousToken: read(names.session)
			});
			if (!result.ok) {
				const { kind, returnTo } = result.error;
				const error = kind === 'email-unverified' ? 'unverified' : 'failed';
				return redirect(signInPath(returnTo, error), [clear(names.signIn)]);
			}
			const { token, expiresAt, returnTo } = result.value;
			return redirect(returnTo, [clear(names.signIn), sessionCookie(token, expiresAt)]);
		},

		async signOut({ cookie: read }) {
			const { url } = await auth.signOut(read(names.session));
			return redirect(url, [clear(names.session)]);
		},

		async authenticate(read) {
			const token = read(names.session);
			if (!token) return { viewer: null, cookies: [] };
			const found = await auth.authenticate(token);
			if (!found) return { viewer: null, cookies: [clear(names.session)] };
			return {
				viewer: found.viewer,
				cookies: found.renewedUntil ? [sessionCookie(token, found.renewedUntil)] : []
			};
		},

		checkOrigin({ method, origin, fetchSite }) {
			if (SAFE_METHODS.has(method.toUpperCase())) return null;
			if (origin === publicOrigin) return null;
			// Browsers send Origin on every non-GET request; Sec-Fetch-Site covers any that don't.
			if (origin === null && fetchSite === 'same-origin') return null;
			return problem({
				type: 'toe-beans/forbidden',
				title: 'Cross-site request refused',
				status: 403
			});
		}
	};
}
