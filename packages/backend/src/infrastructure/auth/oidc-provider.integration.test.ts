// The openid-client adapter against a real OIDC provider: the mock provider used by e2e and
// offline dev (architecture §3.4), in non-interactive mode with fixed claims.
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IdentityProvider } from '../../application/ports/index.js';
import { MOCK_OIDC_IMAGE } from '../../../test/mock-oidc.js';
import { oidcIdentityProvider } from './oidc-provider.js';

const redirectUri = 'http://localhost:7877/auth/callback';
const claims = { sub: 'user-1', email: 'sam@example.com', email_verified: true, name: 'Sam Doe' };

let container: StartedTestContainer;
let issuer: string;
let idp: IdentityProvider;

beforeAll(async () => {
	container = await new GenericContainer(MOCK_OIDC_IMAGE)
		.withExposedPorts(8080)
		.withEnvironment({
			JSON_CONFIG: JSON.stringify({
				tokenCallbacks: [
					{
						issuerId: 'default',
						requestMappings: [{ requestParam: 'grant_type', match: '*', claims }]
					}
				]
			})
		})
		.withWaitStrategy(Wait.forHttp('/default/.well-known/openid-configuration', 8080))
		.start();
	issuer = `http://${container.getHost()}:${container.getMappedPort(8080)}/default`;
	idp = oidcIdentityProvider({ issuer, clientId: 'toe-beans-test', clientSecret: 'secret' });
}, 120_000);

afterAll(() => container?.stop());

/**
 * A man in the middle between us and the provider that rewrites the ID token's claims and keeps
 * its signature, as a forged token would. It forwards the Host header, so the mock issues tokens
 * for the proxy's origin and discovery and `iss` still match.
 */
async function forgingProxy(forge: (claims: Record<string, unknown>) => void): Promise<Server> {
	const target = new URL(issuer);
	const server = createServer((req, res) => {
		const upstream = request(
			{
				host: target.hostname,
				port: target.port,
				path: req.url,
				method: req.method,
				headers: { ...req.headers, 'accept-encoding': 'identity' }
			},
			async (up) => {
				const chunks: Buffer[] = [];
				for await (const chunk of up) chunks.push(chunk as Buffer);
				let body = Buffer.concat(chunks);
				if (req.url?.endsWith('/token') && up.statusCode === 200) {
					const json = JSON.parse(body.toString()) as { id_token: string };
					const [header, payload, signature] = json.id_token.split('.');
					const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
					forge(claims);
					const forged = Buffer.from(JSON.stringify(claims)).toString('base64url');
					json.id_token = `${header}.${forged}.${signature}`;
					body = Buffer.from(JSON.stringify(json));
				}
				const headers = { ...up.headers, 'content-length': String(body.length) };
				delete headers['transfer-encoding'];
				res.writeHead(up.statusCode!, headers).end(body);
			}
		);
		req.pipe(upstream);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	return server;
}

/** Follows the provider's authorize redirect back to our callback, as a browser would. */
async function authorize(url: string): Promise<URL> {
	const response = await fetch(url, { redirect: 'manual' });
	expect(response.status).toBe(302);
	return new URL(response.headers.get('location')!);
}

describe('oidcIdentityProvider', () => {
	it('signs in with Authorization Code + PKCE and returns the validated claims', async () => {
		const { url, checks } = await idp.beginSignIn({ redirectUri });
		const authorizeUrl = new URL(url);
		expect(Object.fromEntries(authorizeUrl.searchParams)).toMatchObject({
			client_id: 'toe-beans-test',
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: 'openid email profile',
			state: checks.state,
			nonce: checks.nonce,
			code_challenge_method: 'S256'
		});
		expect(authorizeUrl.searchParams.has('prompt')).toBe(false);

		const callback = await authorize(url);
		expect(await idp.completeSignIn(callback, checks)).toEqual({
			ok: true,
			value: {
				issuer,
				subject: 'user-1',
				email: 'sam@example.com',
				emailVerified: true,
				name: 'Sam Doe'
			}
		});
	});

	it('asks again with prompt=login', async () => {
		const { url } = await idp.beginSignIn({ redirectUri, prompt: 'login' });
		expect(new URL(url).searchParams.get('prompt')).toBe('login');
	});

	it('fails on a state that does not match', async () => {
		const { url, checks } = await idp.beginSignIn({ redirectUri });
		const callback = await authorize(url);
		const result = await idp.completeSignIn(callback, { ...checks, state: 'other' });
		expect(result).toMatchObject({ ok: false, error: { kind: 'failed' } });
	});

	it('fails on a nonce that does not match', async () => {
		const { url, checks } = await idp.beginSignIn({ redirectUri });
		const callback = await authorize(url);
		const result = await idp.completeSignIn(callback, { ...checks, nonce: 'other' });
		expect(result).toMatchObject({ ok: false, error: { kind: 'failed' } });
	});

	it('fails on an ID token whose signature does not match its claims', async () => {
		const proxy = await forgingProxy((claims) => {
			claims.sub = 'someone-else';
		});
		try {
			const { port } = proxy.address() as AddressInfo;
			const forged = oidcIdentityProvider({
				issuer: `http://127.0.0.1:${port}/default`,
				clientId: 'toe-beans-test',
				clientSecret: 'secret'
			});
			const { url, checks } = await forged.beginSignIn({ redirectUri });
			const callback = await authorize(url);
			const result = await forged.completeSignIn(callback, checks);
			expect(result).toMatchObject({ ok: false, error: { kind: 'failed' } });
		} finally {
			proxy.closeAllConnections();
			await new Promise((resolve) => proxy.close(resolve));
		}
	});

	it('reports a cancelled sign-in as denied', async () => {
		const { checks } = await idp.beginSignIn({ redirectUri });
		const callback = new URL(`${redirectUri}?error=access_denied&state=${checks.state}`);
		expect(await idp.completeSignIn(callback, checks)).toEqual({
			ok: false,
			error: { kind: 'denied' }
		});
	});

	it("builds the provider's sign-out URL", async () => {
		const url = new URL(await idp.signOutUrl('http://localhost:7877/'));
		expect(url.href.startsWith(`${issuer}/endsession`)).toBe(true);
		expect(url.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:7877/');
		expect(url.searchParams.get('client_id')).toBe('toe-beans-test');
	});

	it('rejects while the provider is unreachable, trying discovery again each time', async () => {
		const down = oidcIdentityProvider({
			issuer: 'http://127.0.0.1:9/default',
			clientId: 'x',
			clientSecret: 'y'
		});
		await expect(down.beginSignIn({ redirectUri })).rejects.toThrow();
		await expect(down.beginSignIn({ redirectUri })).rejects.toThrow();
	});
});
