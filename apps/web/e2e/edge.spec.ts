// Scanners' probes get a plain 404 rather than the app shell, and security.txt says where to report
// a problem (backlog S17.3).
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('a probe from a script gets a short plain 404, not the app shell', async ({ request }) => {
	for (const path of [
		'/.env',
		'/.git/config',
		'/wp-login.php',
		'/actuator/health',
		'/v2/_catalog'
	]) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(404);
		expect(response.headers()['content-type'], path).toBe('text/plain; charset=utf-8');
		expect(response.headers()['cache-control'], path).toBe('no-store');
		expect(await response.text(), path).toBe('Not found\n');
	}
});

test('an unknown API path still asks for sign-in first', async ({ request }) => {
	expect((await request.get('/api/v1/nothing-here')).status()).toBe(401);
});

test("a person who opens a mistyped address sees the app's own page", async ({ page }) => {
	const response = await page.goto('/no-such-page');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that");
});

test('security.txt gives the contact and an expiry within a year', async ({ request }) => {
	const response = await request.get('/.well-known/security.txt');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');
	const text = await response.text();
	expect(text).toContain('Contact: mailto:support@toebeans.co.za\n');
	const expires = Date.parse(/^Expires: (.+)$/m.exec(text)?.[1] ?? '');
	expect(expires).toBeGreaterThan(Date.now());
	expect(expires).toBeLessThanOrEqual(Date.now() + 366 * 24 * 60 * 60 * 1000);
});
