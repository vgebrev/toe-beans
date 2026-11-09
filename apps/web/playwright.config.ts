// End-to-end tests (architecture §10) on the two acceptance phones (requirements, CLAUDE.md),
// emulated in Chromium: the target is Chrome on Android. The tests run against the production
// build, so they exercise what ships, and need MongoDB like `pnpm dev` does.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { SIGNED_IN } from './e2e/mock-sign-in.js';

// MONGODB_URI and friends from the repo root's .env, as for `pnpm dev`. The shell's own
// variables win.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const port = 4173;

// Built from Playwright's Pixel 7 profile (Chrome for Android), resized to each phone. The
// viewports are the visible area above the phone's own navigation buttons. The Samsung's is
// measured (the owner's DevTools profile matched to the real phone); the Redmi's is estimated
// until measured the same way (S13).
const android = (
	model: string,
	androidVersion: number,
	width: number,
	height: number,
	dpr: number
) => ({
	...devices['Pixel 7'],
	userAgent: devices['Pixel 7'].userAgent.replace(
		'Android 14; Pixel 7',
		`Android ${androidVersion}; ${model}`
	),
	viewport: { width, height },
	deviceScaleFactor: dpr
});

export default defineConfig({
	testDir: 'e2e',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'retain-on-failure'
	},
	projects: [
		// Signs in once through the mock provider; the phones reuse the session. The auth suite
		// starts signed out instead.
		{ name: 'sign-in', testMatch: /auth\.setup\.ts/ },
		// Measured: 384 × 700 CSS px. 1080 px wide at One UI's default display size is 2.8125×.
		{
			name: 'galaxy-s23-fe',
			use: { ...android('SM-S711B', 15, 384, 700, 2.8125), storageState: SIGNED_IN },
			dependencies: ['sign-in']
		},
		// Estimated: 1080 × 2400 at 2.75× is ~393 × 873 CSS px, minus status and navigation bars.
		{
			name: 'redmi-note-12-pro',
			use: { ...android('22101316G', 15, 393, 830, 2.75), storageState: SIGNED_IN },
			dependencies: ['sign-in']
		}
	],
	webServer: {
		command: 'pnpm build && node build',
		// Ready once Mongo is connected and migrated.
		url: `http://localhost:${port}/readyz`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			PORT: String(port),
			// Its own database, so tests never touch dev data.
			MONGODB_DB: 'toe-beans-e2e',
			LOG_LEVEL: 'warn',
			// Always the mock provider (docker compose / the CI service), whatever .env says, so
			// tests sign in by filling its form (architecture §3.4).
			PUBLIC_BASE_URL: `http://localhost:${port}`,
			OIDC_ISSUER: 'http://localhost:8090/default',
			OIDC_CLIENT_ID: 'toe-beans-e2e',
			OIDC_CLIENT_SECRET: 'e2e-secret',
			// Every test signs in from localhost, which would soon hit the per-address limit.
			AUTH_RATE_LIMIT: '10000',
			INVITE_RATE_LIMIT: '10000',
			// Whatever .env says: tests invite made-up addresses, and must never send real mail.
			EMAIL_SENDER: 'console',
			// Test photos in their own directory, never dev's photos or a real bucket.
			PHOTO_STORE: 'filesystem',
			PHOTO_DIR: join(tmpdir(), 'toe-beans-e2e-photos'),
			BODY_SIZE_LIMIT: '11M'
		}
	}
});
