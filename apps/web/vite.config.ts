import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

export default defineConfig({
	server: { port: devPort, strictPort: true },
	preview: { port: devPort, strictPort: true },
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
			version: { name: release() }
		})
	]
});
