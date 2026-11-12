// Running the reminder tick from a test, as Cloud Scheduler would (architecture §6.3). e2e runs
// the app with WORKER_MODE=http, so reminders go out only when a test asks.
import { expect, type Page } from '@playwright/test';

/** Test-only: the app under test takes it as its tick secret (playwright.config.ts). */
export const TICK_SECRET = 'e2e-tick-secret-not-for-anything-real';

export async function runTick(page: Page) {
	const response = await page.request.post('/internal/tick', {
		headers: { authorization: `Bearer ${TICK_SECRET}` }
	});
	expect(response.status()).toBe(200);
	return (await response.json()) as { claimed: number; sent: number };
}
