// Sign-in, sessions and sign-out (architecture §3.4, NFR-01), through the mock OIDC provider.
// Every test here starts signed out.
import { expect, test } from '@playwright/test';
import { blockMockFonts, newPerson, signInAtMockProvider } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

test('a signed-out visit goes to sign-in, then back to the same page', async ({ page }) => {
	await page.goto('/plan?view=week');
	await expect(page).toHaveURL('/sign-in?returnTo=%2Fplan%3Fview%3Dweek');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Toe Beans');

	const person = newPerson();
	await page.getByRole('link', { name: 'Sign in' }).click();
	await signInAtMockProvider(page, person);

	await expect(page).toHaveURL('/plan?view=week');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
	await expect(page.getByLabel('Your name')).toHaveValue(person.name);
	await expect(page.getByText(person.email)).toBeVisible();
});

test('the sign-in page renders on the phone without errors, sideways scrolling or third parties', async ({
	page,
	baseURL
}) => {
	const errors: string[] = [];
	const foreign: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('request', (r) => !r.url().startsWith(baseURL!) && foreign.push(r.url()));

	await page.goto('/sign-in');
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	expect(
		(await page.getByRole('link', { name: 'Sign in' }).boundingBox())!.height
	).toBeGreaterThanOrEqual(48);
	expect(errors).toEqual([]);
	expect(foreign).toEqual([]);
});

test('an email the provider has not verified is refused, with no session', async ({ page }) => {
	await page.goto('/care');
	await page.getByRole('link', { name: 'Sign in' }).click();
	await signInAtMockProvider(page, { ...newPerson(), emailVerified: false });

	await expect(page).toHaveURL('/sign-in?error=unverified&returnTo=%2Fcare');
	await expect(page.getByRole('alert')).toContainText('Please verify your email first');
	await expect(page.getByRole('link', { name: 'Use a different account' })).toHaveAttribute(
		'href',
		'/auth/sign-in?returnTo=%2Fcare&prompt=login'
	);
	await page.goto('/care');
	await expect(page).toHaveURL('/sign-in?returnTo=%2Fcare');
});

test('a callback without a sign-in in progress says it failed', async ({ page }) => {
	await page.goto('/auth/callback?code=stolen&state=guess');
	await expect(page).toHaveURL('/sign-in?error=failed');
	await expect(page.getByRole('alert')).toHaveText("Signing in didn't work. Please try again.");
});

// The limit itself is unit tested; the e2e server raises it, since every test signs in from here.
test('the sign-in page asks to wait after too many attempts', async ({ page }) => {
	await page.goto('/sign-in?error=too-many');
	await expect(page.getByRole('alert')).toHaveText(
		'Too many sign-in attempts. Please wait a few minutes, then try again.'
	);
});

test('signing out ends the session', async ({ page, context }) => {
	await page.goto('/sign-in');
	await page.getByRole('link', { name: 'Sign in' }).click();
	await signInAtMockProvider(page, newPerson());
	await page.goto('/more');
	const session = (await context.cookies()).find((c) => c.name === 'tb_session')!;
	expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL('/sign-in');
	expect((await context.cookies()).map((c) => c.name)).not.toContain('tb_session');

	// The old cookie is dead even if someone kept a copy.
	await context.addCookies([session]);
	await page.goto('/more');
	await expect(page).toHaveURL('/sign-in?returnTo=%2Fmore');
});

test('a made-up session cookie counts as signed out, and is cleared', async ({
	page,
	context,
	baseURL
}) => {
	await context.addCookies([{ name: 'tb_session', value: 'A'.repeat(43), url: baseURL! }]);
	await page.goto('/');
	await expect(page).toHaveURL('/sign-in');
	expect((await context.cookies()).map((c) => c.name)).not.toContain('tb_session');
});

test('the API answers 401 problem details when signed out', async ({ request }) => {
	const response = await request.get('/api/v1/anything');
	expect(response.status()).toBe(401);
	expect(response.headers()['content-type']).toBe('application/problem+json');
	expect(await response.json()).toMatchObject({ type: 'toe-beans/unauthenticated' });
});

test('writes from another site are refused', async ({ request }) => {
	for (const headers of [{ origin: 'https://evil.example' }, {}] as Record<string, string>[]) {
		const response = await request.post('/auth/sign-out', { headers });
		// Our check in hooks.server.ts, not Kit's (which is off): problem details.
		expect(response.status()).toBe(403);
		expect(await response.json()).toMatchObject({ type: 'toe-beans/forbidden' });
	}
});
