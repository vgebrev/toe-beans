import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Local settings from the repo root's .env, if there is one (.env.example). The shell's own
// variables win. The backend reads process.env, so this covers `pnpm dev` and the build.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// 7877 spells PUPP on a phone keypad. strictPort fails loudly instead of drifting to another port.
const devPort = Number(process.env.DEV_PORT ?? 7877);

// The build's name, shown on More and sent with browser error reports: APP_RELEASE when the
// pipeline sets it, else the git commit, else Kit's default (a timestamp).
function release(): string | undefined {
	if (process.env.APP_RELEASE) return process.env.APP_RELEASE;
	try {
		return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return undefined;
	}
}

// https for the dev server and `vite preview` when DEV_HTTPS_CERT and DEV_HTTPS_KEY name a
// certificate and key (paths from the repo root, e.g. from mkcert; README). A phone then gets a
// secure context, so the service worker, install and push work on toebeans.test as on prod.
const rootUrl = new URL('../../', import.meta.url);
function devHttps(): { cert: Buffer; key: Buffer } | undefined {
	const { DEV_HTTPS_CERT: cert, DEV_HTTPS_KEY: key } = process.env;
	if (!cert && !key) return undefined;
	if (!cert || !key) throw new Error('Set both DEV_HTTPS_CERT and DEV_HTTPS_KEY, or neither');
	const read = (path: string) => readFileSync(fileURLToPath(new URL(path, rootUrl)));
	return { cert: read(cert), key: read(key) };
}
const https = devHttps();

// Vite refuses Host headers it doesn't know. toebeans.test is the dev machine's name on the LAN
// (dnsmasq), so phones and laptops open one URL (README).
const allowedHosts = ['toebeans.test'];

export default defineConfig({
	server: { port: devPort, strictPort: true, allowedHosts, ...(https && { https }) },
	preview: { port: devPort, strictPort: true, allowedHosts, ...(https && { https }) },
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// One Node container (architecture §8.1).
			adapter: adapter(),
			// CSRF is checked in hooks.server.ts instead (architecture §3.4): against the runtime
			// PUBLIC_BASE_URL, for every non-GET request whatever its content type. Kit's own check
			// compares with the request URL's origin, which adapter-node assumes is https and which
			// behind the Cloudflare Worker is run.app, so it refused same-origin forms.
			csrf: { trustedOrigins: ['*'] },
			version: { name: release() }
		})
	]
});
