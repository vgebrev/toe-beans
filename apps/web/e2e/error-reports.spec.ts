// Browser error reports go through the app's own origin, not Sentry's hosts, which ad blockers
// block (architecture D41, backlog S17.1).
import { expect, test } from '@playwright/test';
import { ERROR_RELAY_PATH } from '@toe-beans/contracts';
import { E2E_SENTRY_DSN } from './error-relay.js';

const envelope = (dsn: string) =>
	`${JSON.stringify({ event_id: 'a'.repeat(32), dsn })}\n{"type":"event"}\n{"message":"e2e"}`;

test("a browser error is posted to the app's origin and sent on from there", async ({ page }) => {
	const elsewhere: string[] = [];
	page.on('request', (r) => {
		if (new URL(r.url()).port === '4175') elsewhere.push(r.url());
	});
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
	// The SDK loads after the first render; it's ready once it has set up its global.
	await page.waitForFunction(() => '__SENTRY__' in globalThis);

	const report = page.waitForRequest((r) => new URL(r.url()).pathname === ERROR_RELAY_PATH);
	await page.evaluate(() => {
		setTimeout(() => {
			throw new Error('e2e relay check');
		});
	});
	const request = await report;
	expect(new URL(request.url()).origin).toBe(new URL(page.url()).origin);
	expect(request.postData()).toContain('e2e relay check');
	expect(request.postData()).toContain(JSON.stringify(E2E_SENTRY_DSN));
	// No real Sentry behind the e2e DSN: 502 means the relay took it and tried to send it on.
	expect((await request.response())?.status()).toBe(502);
	expect(elsewhere).toEqual([]);
});

test('the relay sends on only reports for our own project, from our own pages', async ({
	request,
	baseURL
}) => {
	const post = (data: string, origin = baseURL!) =>
		request.post(ERROR_RELAY_PATH, {
			data,
			headers: { origin, 'content-type': 'application/x-sentry-envelope' }
		});
	expect((await post(envelope('https://e2e0public0key@localhost:4175/2'))).status()).toBe(400);
	expect((await post('hello')).status()).toBe(400);
	expect((await post(envelope(E2E_SENTRY_DSN), 'https://elsewhere.example')).status()).toBe(403);
	expect((await post(envelope(E2E_SENTRY_DSN))).status()).toBe(502);
});
