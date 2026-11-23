// Accepting the terms with the age confirmation (backlog S19.1): asked before anything is set
// up, recorded, and required for every API write except accepting and deleting the account.
import { expect, test } from '@playwright/test';
import {
	acceptTerms,
	blockMockFonts,
	jsonHeaders,
	newPerson,
	signIn,
	signInAtMockProvider,
	ZONE
} from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

test('someone new accepts the terms before onboarding, and nothing is saved until then', async ({
	page,
	baseURL
}) => {
	await signIn(page, newPerson(), undefined, { agree: false });
	// Signing in lands on Today, which asks for the terms before it sends them to onboarding.
	await expect(page).toHaveURL('/agree');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Before you start');
	await expect(page.getByRole('link', { name: 'Terms of service' })).toHaveAttribute(
		'href',
		'/terms'
	);
	await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
		'href',
		'/privacy'
	);

	// The app and onboarding both send them back here.
	await page.goto('/plan');
	await expect(page).toHaveURL('/agree?returnTo=%2Fplan');
	await page.goto('/onboarding');
	await expect(page).toHaveURL('/agree?returnTo=%2Fonboarding');

	// The API refuses writes until they accept.
	const early = await page.request.post('/api/v1/household', {
		headers: jsonHeaders(baseURL!),
		data: JSON.stringify({ name: 'Too soon', timeZone: ZONE })
	});
	expect(early.status()).toBe(403);
	expect((await early.json()).type).toBe('toe-beans/terms-required');

	const box = page.getByRole('checkbox', { name: /18 or older/ });
	const label = page.locator('label').filter({ has: box });
	expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(48);
	const go = page.getByRole('button', { name: 'Continue' });
	await expect(go).toBeDisabled();
	await box.check();
	await go.click();

	await expect(page).toHaveURL('/onboarding');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'What should your household call you?'
	);
	// Accepted once, never asked again.
	await page.goto('/agree');
	await expect(page).toHaveURL('/onboarding');
	const later = await page.request.post('/api/v1/household', {
		headers: jsonHeaders(baseURL!),
		data: JSON.stringify({ name: 'The Testers', timeZone: ZONE })
	});
	expect(later.status()).toBe(201);
});

test('only the terms in force can be accepted', async ({ page, baseURL }) => {
	await signIn(page, newPerson(), undefined, { agree: false });
	const stale = await page.request.post('/api/v1/me/terms', {
		headers: jsonHeaders(baseURL!),
		data: JSON.stringify({ version: '2020-01-01' })
	});
	expect(stale.status()).toBe(409);
	await page.goto('/onboarding');
	await expect(page).toHaveURL(/\/agree/);
});

test('an invitee signs in, accepts the terms, and comes back to the invite', async ({
	browser,
	page,
	baseURL
}) => {
	// An owner with an invite link.
	await signIn(page, newPerson('owner'));
	await page.request.post('/api/v1/household', {
		headers: jsonHeaders(baseURL!),
		data: JSON.stringify({ name: 'The Does', timeZone: ZONE })
	});
	const invite = await page.request.post('/api/v1/household/invitations', {
		headers: jsonHeaders(baseURL!),
		data: JSON.stringify({ kind: 'link' })
	});
	expect(invite.status()).toBe(201);
	const { url } = await invite.json();
	const path = new URL(url).pathname;

	const context = await browser.newContext({ baseURL: baseURL! });
	const invitee = await context.newPage();
	await blockMockFonts(invitee);
	await invitee.goto(path);
	await invitee.getByRole('link', { name: 'Sign in to accept' }).click();
	await signInAtMockProvider(invitee, newPerson('alex'), { agree: false });

	await expect(invitee).toHaveURL(`/agree?returnTo=${encodeURIComponent(path)}`);
	await acceptTerms(invitee);
	await expect(invitee).toHaveURL(path);
	await invitee.getByRole('button', { name: 'Accept invite' }).click();
	await expect(invitee.getByRole('heading', { level: 1 })).toHaveText('Today');
	await context.close();
});

test("someone new who won't accept can delete their account there", async ({ page }) => {
	await signIn(page, newPerson(), undefined, { agree: false });
	await page.getByRole('button', { name: 'Delete my account' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click();
	// Signed out at the provider, then back at sign-in with no session.
	await expect(page).toHaveURL(/\/sign-in/);
	await page.goto('/onboarding');
	await expect(page).toHaveURL(/\/sign-in/);
});

test('the agree page fits the phone with no errors or third parties', async ({ page, baseURL }) => {
	await signIn(page, newPerson(), undefined, { agree: false });
	const errors: string[] = [];
	const foreign: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('request', (r) => !r.url().startsWith(baseURL!) && foreign.push(r.url()));
	await page.reload();
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	expect(errors).toEqual([]);
	expect(foreign).toEqual([]);
});
