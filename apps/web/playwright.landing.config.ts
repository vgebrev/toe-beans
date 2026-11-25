// The landing page's screenshots of the app (e2e/landing-shots.ts), on their own so
// `pnpm test:e2e` never rewrites the images: `pnpm landing:shots` from the repo root. Same server,
// database and mock sign-in as the e2e suite.
import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
	...base,
	testMatch: /landing-shots\.ts$/,
	projects: [
		{
			name: 'landing-shots',
			// The Redmi Note 12 Pro's viewport (playwright.config.ts), at 3× for sharp pictures.
			use: { ...devices['Pixel 7'], viewport: { width: 393, height: 830 }, deviceScaleFactor: 3 }
		}
	]
});
