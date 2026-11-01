// End-to-end tests (architecture §10) on the two acceptance phones (requirements, CLAUDE.md),
// emulated in Chromium: the target is Chrome on Android. The tests run against the production
// build, so they exercise what ships, and need MongoDB like `pnpm dev` does.
import { defineConfig, devices } from '@playwright/test';

const port = 4173;

// Built from Playwright's Pixel 7 profile (Chrome for Android), resized to each phone. The
// viewports are the installed PWA's visible area, approximately: the screen minus the status bar
// and gesture bar. Measure on the phones in S13 and correct them if they differ.
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
		// 1080 × 2340 at 3×: 360 × 780 CSS px.
		{ name: 'galaxy-s23-fe', use: android('SM-S711B', 15, 360, 740, 3) },
		// 1080 × 2400 at 2.75×: ~393 × 873 CSS px.
		{ name: 'redmi-note-12-pro', use: android('22101316G', 15, 393, 830, 2.75) }
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
			LOG_LEVEL: 'warn'
		}
	}
});
