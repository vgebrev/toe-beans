// First run, inviting and joining (ui.md J1, J2, §4.8; FR-01, scenarios 1 and 9). Each test brings
// its own people through the mock provider, so most start signed out.
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	blockMockFonts,
	createHousehold,
	newPerson,
	signIn,
	signInAtMockProvider,
	type TestPerson
} from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

/** A second person on their own browser profile. */
async function secondPerson(browser: Browser, baseURL: string): Promise<Page> {
	const context = await browser.newContext({ baseURL, storageState: undefined });
	const page = await context.newPage();
	await blockMockFonts(page);
	return page;
}

const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });

async function createLink(page: Page, baseURL: string): Promise<{ url: string; id: string }> {
	const response = await page.request.post('/api/v1/household/invitations', {
		headers: json(baseURL),
		data: JSON.stringify({ kind: 'link' })
	});
	expect(response.status()).toBe(201);
	return response.json();
}

async function owner(page: Page, baseURL: string, name?: string): Promise<TestPerson> {
	const person = newPerson('owner');
	await signIn(page, person);
	await createHousehold(page, baseURL, name);
	return person;
}

test('first run: your name, your household, then an invite you can skip', async ({ page }) => {
	const person = { ...newPerson(), name: '' };
	await page.goto('/');
	await page.getByRole('link', { name: 'Sign in' }).click();
	await signInAtMockProvider(page, person);

	await expect(page).toHaveURL('/onboarding');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'What should your household call you?'
	);
	// An email sign-up has no name, so it starts as the start of the address.
	const name = page.getByLabel('Your name');
	await expect(name).toHaveValue(person.email.split('@')[0]!);
	await name.fill('Sam');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page).toHaveURL('/onboarding/household');
	await expect(page.getByLabel('Time zone')).toHaveValue(
		await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
	);
	const create = page.getByRole('button', { name: 'Create household' });
	await expect(create).toBeDisabled();
	await page.getByLabel('Household name').fill('  The   Does ');
	await page.getByLabel('Time zone').selectOption('Africa/Johannesburg');
	await create.click();

	await expect(page).toHaveURL('/onboarding/invite');
	await page.getByRole('link', { name: 'Done for now' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');

	await page.goto('/more');
	await expect(page.getByLabel('Your name')).toHaveValue('Sam');
	await page.getByRole('link', { name: /Household & invites/ }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Does');
	await expect(page.getByRole('listitem').filter({ hasText: 'Sam (you)' })).toContainText('Owner');
	const nav = page.getByRole('navigation', { name: 'Main' });
	await expect(nav.getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page');
});

test('nobody without a household reaches the app, and nobody with one sees onboarding', async ({
	page,
	baseURL
}) => {
	await signIn(page, newPerson(), '/plan');
	await expect(page).toHaveURL('/onboarding');
	await page.goto('/onboarding/invite');
	await expect(page).toHaveURL('/onboarding');
	expect((await page.request.get('/api/v1/household')).status()).toBe(404);

	await createHousehold(page, baseURL!);
	await page.goto('/onboarding/household');
	await expect(page).toHaveURL('/');
	const again = await page.request.post('/api/v1/household', {
		headers: json(baseURL!),
		data: JSON.stringify({ name: 'Second', timeZone: 'UTC' })
	});
	expect(again.status()).toBe(409);
});

test('a bad time zone or blank name comes back as field errors', async ({ page, baseURL }) => {
	await signIn(page, newPerson());
	const response = await page.request.post('/api/v1/household', {
		headers: json(baseURL!),
		data: JSON.stringify({ name: ' ', timeZone: 'Mars/Olympus' })
	});
	expect(response.status()).toBe(400);
	expect((await response.json()).errors).toMatchObject({
		name: [expect.any(String)],
		timeZone: [expect.any(String)]
	});
});

test('scenario 1: an invite link brings a second caregiver in, through sign-in', async ({
	page,
	browser,
	baseURL
}) => {
	await owner(page, baseURL!, 'The Does');
	await page.goto('/household');
	await page.getByRole('button', { name: 'Create an invite link' }).click();
	const link = page.getByLabel('Invite link');
	await expect(link).toHaveValue(/\/join\/[\w-]{43}$/);
	const url = await link.inputValue();
	await expect(page.getByRole('listitem').filter({ hasText: 'Invite link' })).toContainText('From');

	const invitee = await secondPerson(browser, baseURL!);
	await invitee.goto(url);
	await expect(invitee.getByRole('heading', { level: 1 })).toHaveText(
		"You've been invited to join The Does"
	);
	await invitee.getByRole('link', { name: 'Sign in to accept' }).click();
	await signInAtMockProvider(invitee, { ...newPerson('alex'), name: 'Alex' });

	await expect(invitee).toHaveURL(new URL(url).pathname);
	await invitee.getByRole('button', { name: 'Accept invite' }).click();
	await expect(invitee.getByRole('heading', { level: 1 })).toHaveText('Today');

	// It works once, and the owner sees who joined.
	await page.reload();
	await expect(page.getByRole('listitem').filter({ hasText: 'Alex' })).toContainText('Caregiver');
	await expect(page.getByText('No invites waiting.')).toBeVisible();

	await invitee.goto(url);
	await expect(invitee.getByRole('heading', { level: 1 })).toHaveText("You're already in The Does");

	const third = await secondPerson(browser, baseURL!);
	await third.goto(url);
	await expect(third.getByRole('heading', { level: 1 })).toHaveText(
		'This invite has already been used'
	);
	await expect(third.getByText('The Does')).toHaveCount(0);
	await invitee.context().close();
	await third.context().close();
});

test('an email invite is checked, sent and listed', async ({ page, baseURL }) => {
	await owner(page, baseURL!);
	await page.goto('/household');
	const email = page.getByLabel('Or send an email invite');
	await email.fill('not an address');
	await page.getByRole('button', { name: 'Send invite' }).click();
	await expect(page.getByText('Enter a valid email address.')).toBeVisible();
	await expect(email).toHaveValue('not an address');

	await email.fill('Jane@Example.com');
	await page.getByRole('button', { name: 'Send invite' }).click();
	await expect(page.getByText('Invite sent to jane@example.com')).toBeVisible();
	await expect(email).toHaveValue('');
	await expect(page.getByRole('listitem').filter({ hasText: 'jane@example.com' })).toBeVisible();
});

test('revoking asks first, and stops the link', async ({ page, browser, baseURL }) => {
	await owner(page, baseURL!);
	const { url } = await createLink(page, baseURL!);
	await page.goto('/household');

	await page.getByRole('button', { name: 'Revoke' }).click();
	const sheet = page.getByRole('dialog');
	await expect(sheet).toContainText('Nobody will be able to join with this invite link.');
	const confirm = sheet.getByRole('button', { name: 'Revoke invite' });
	expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(48);
	await confirm.click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('No invites waiting.')).toBeVisible();

	const invitee = await secondPerson(browser, baseURL!);
	await invitee.goto(url);
	await expect(invitee.getByRole('heading', { level: 1 })).toHaveText('This invite was cancelled');
	await invitee.context().close();
});

test('revoking an invite from an older page changes nothing, and says so', async ({
	page,
	baseURL
}) => {
	await owner(page, baseURL!);
	const { id } = await createLink(page, baseURL!);
	await page.goto('/household');
	await page.getByRole('button', { name: 'Revoke' }).click();

	// Revoked elsewhere while this sheet is open.
	const elsewhere = await page.request.delete(`/api/v1/household/invitations/${id}`, {
		headers: { origin: baseURL!, 'if-match': '"1"' }
	});
	expect(elsewhere.status()).toBe(204);

	await page.getByRole('dialog').getByRole('button', { name: 'Revoke invite' }).click();
	await expect(page.getByText('That invite changed a moment ago')).toBeVisible();
	await expect(page.getByText('No invites waiting.')).toBeVisible();
});

test('a failed save keeps what was typed and offers a retry (NFR-04)', async ({ page }) => {
	await signIn(page, newPerson());
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL('/onboarding/household');
	await page.getByLabel('Household name').fill('The Does');

	await page.route('**/api/v1/household', (route) => route.abort());
	await page.getByRole('button', { name: 'Create household' }).click();
	await expect(page.getByRole('alert')).toHaveText("Couldn't save — check your connection.");
	await expect(page.getByLabel('Household name')).toHaveValue('The Does');

	await page.unroute('**/api/v1/household');
	await page.getByRole('button', { name: 'Retry' }).click();
	await expect(page).toHaveURL('/onboarding/invite');
});

test("an email that can't be sent says so, and keeps the address", async ({ page, baseURL }) => {
	await owner(page, baseURL!);
	await page.goto('/household');
	await page.route('**/api/v1/household/invitations', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/problem+json',
			body: JSON.stringify({
				type: 'toe-beans/unavailable',
				title: 'That did not work',
				status: 503,
				detail: "Couldn't send the email. Try again, or share a link instead."
			})
		})
	);
	await page.getByLabel('Or send an email invite').fill('jane@example.com');
	await page.getByRole('button', { name: 'Send invite' }).click();
	await expect(page.getByRole('alert')).toContainText("Couldn't send the email.");
	await expect(page.getByLabel('Or send an email invite')).toHaveValue('jane@example.com');
	await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('a failed join can be retried, and a refused one explains itself (ui.md J2)', async ({
	page,
	browser,
	baseURL
}) => {
	await owner(page, baseURL!, 'The Does');
	const { url } = await createLink(page, baseURL!);
	const invitee = await secondPerson(browser, baseURL!);
	await signIn(invitee, newPerson('alex'), new URL(url).pathname);
	const accept = invitee.getByRole('button', { name: 'Accept invite' });
	await expect(accept).toBeVisible();

	await invitee.route('**/accept', (route) => route.abort());
	await accept.click();
	await expect(invitee.getByRole('alert')).toHaveText("Couldn't join — check your connection.");
	await invitee.unroute('**/accept');

	// The server refuses, and the page asks it why. Real email invites can't be opened from e2e
	// (the link goes to the console), so the answer is stubbed; the rule is unit tested.
	await invitee.route('**/accept', (route) =>
		route.fulfill({
			status: 409,
			contentType: 'application/problem+json',
			body: JSON.stringify({ type: 'toe-beans/conflict', title: 'Clash', status: 409 })
		})
	);
	await invitee.route('**/api/v1/invitations/*', (route) =>
		route.fulfill({
			json: {
				status: 'email-mismatch',
				signedIn: true,
				householdName: 'The Does',
				emailHint: 'j•••@gmail.com'
			}
		})
	);
	await invitee.getByRole('button', { name: 'Retry' }).click();
	await expect(invitee.getByRole('alert')).toHaveText(
		'This invite was sent to j•••@gmail.com. Sign in with that address.'
	);
	await expect(invitee.getByRole('link', { name: 'Use a different account' })).toHaveAttribute(
		'href',
		/prompt=login/
	);
	await invitee.context().close();
});

test('a made-up link says so, without an error page', async ({ page }) => {
	await page.goto(`/join/${'A'.repeat(43)}`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("This invite isn't valid");
	await page.goto('/join/nonsense');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("This invite isn't valid");
});

test('someone in a household can see an invite but not join a second one (D16)', async ({
	page,
	browser,
	baseURL
}) => {
	await owner(page, baseURL!, 'The Does');
	const { url } = await createLink(page, baseURL!);

	const other = await secondPerson(browser, baseURL!);
	await owner(other, baseURL!, 'The Others');
	await other.goto(url);
	await expect(other.getByRole('heading', { level: 1 })).toHaveText('You already have a household');

	const token = new URL(url).pathname.split('/').pop()!;
	const accept = await other.request.post(`/api/v1/invitations/${token}/accept`, {
		headers: { origin: baseURL! }
	});
	expect(accept.status()).toBe(409);
	await page.goto('/household');
	await expect(page.getByRole('list').first().getByRole('listitem')).toHaveCount(1);
	await other.context().close();
});

test('scenario 9: an outsider reaches nothing by changing identifiers', async ({
	page,
	browser,
	baseURL
}) => {
	await owner(page, baseURL!, 'The Does');
	const { id, url } = await createLink(page, baseURL!);

	const outsider = await secondPerson(browser, baseURL!);
	await owner(outsider, baseURL!, 'The Others');
	const headers = { origin: baseURL!, 'if-match': '"1"' };

	// Another household's invitation, by ID, with the right version.
	const revoke = await outsider.request.delete(`/api/v1/household/invitations/${id}`, { headers });
	expect(revoke.status()).toBe(404);
	expect(await revoke.json()).toEqual({
		type: 'toe-beans/not-found',
		title: 'Invitation not found',
		status: 404
	});

	// Their own lists show only their own household.
	const household = await (await outsider.request.get('/api/v1/household')).json();
	expect(household.name).toBe('The Others');
	const list = await (await outsider.request.get('/api/v1/household/invitations')).json();
	expect(list.invitations).toEqual([]);

	// The body can't point somewhere else.
	const smuggled = await outsider.request.post('/api/v1/household/invitations', {
		headers: json(baseURL!),
		data: JSON.stringify({ kind: 'link', householdId: id })
	});
	expect(smuggled.status()).toBe(400);

	// A guessed token finds nothing, signed in or not.
	const guess = 'A'.repeat(43);
	expect((await outsider.request.get(`/api/v1/invitations/${guess}`)).status()).toBe(404);
	const accept = await outsider.request.post(`/api/v1/invitations/${guess}/accept`, { headers });
	expect(accept.status()).toBe(404);

	// And the invitation still works for the person it was for.
	await outsider.context().close();
	const invitee = await secondPerson(browser, baseURL!);
	await invitee.goto(url);
	await expect(invitee.getByRole('link', { name: 'Sign in to accept' })).toBeVisible();
	await invitee.context().close();
});

test('the household API needs a session; only the invite preview works signed out', async ({
	request,
	baseURL
}) => {
	for (const path of ['/api/v1/household', '/api/v1/household/invitations']) {
		expect((await request.get(path)).status()).toBe(401);
	}
	const token = 'A'.repeat(43);
	expect((await request.get(`/api/v1/invitations/${token}`)).status()).toBe(404);
	const accept = await request.post(`/api/v1/invitations/${token}/accept`, {
		headers: { origin: baseURL! }
	});
	expect(accept.status()).toBe(401);
});

/** An owner on `page`, and a caregiver who joined by link on their own browser profile. */
async function twoPeople(page: Page, browser: Browser, baseURL: string, ownerName?: string) {
	await owner(page, baseURL, ownerName);
	const { url } = await createLink(page, baseURL);
	const caregiver = await secondPerson(browser, baseURL);
	const person = newPerson('caregiver');
	await signIn(caregiver, person);
	await caregiver.goto(url);
	await caregiver.getByRole('button', { name: 'Accept invite' }).click();
	await expect(caregiver.getByRole('heading', { level: 1 })).toHaveText('Today');
	return { caregiver, person };
}

test('the owner leaves: the next member owns it, and the leaver starts again (D18)', async ({
	page,
	browser,
	baseURL
}) => {
	const { caregiver, person } = await twoPeople(page, browser, baseURL!);
	await page.goto('/household');
	await page.getByRole('button', { name: 'Leave household' }).click();
	const sheet = page.getByRole('dialog');
	await expect(sheet).toContainText(`${person.name} becomes the owner.`);
	await sheet.getByRole('button', { name: 'Leave household' }).click();
	await expect(page).toHaveURL('/onboarding/household');
	await expect(page.getByRole('button', { name: /^Rejoin/ })).toHaveCount(0);

	await caregiver.goto('/household');
	await expect(caregiver.getByRole('listitem').filter({ hasText: '(you)' })).toContainText('Owner');
	await caregiver.context().close();
});

test('the last person out deactivates it, stops its invites, and can bring it back (D18)', async ({
	page,
	browser,
	baseURL
}) => {
	await owner(page, baseURL!, 'The Quiet House');
	const { url } = await createLink(page, baseURL!);
	await page.goto('/household');
	await page.getByRole('button', { name: 'Leave household' }).click();
	const sheet = page.getByRole('dialog');
	await expect(sheet).toContainText('Nobody will be left in The Quiet House');
	await sheet.getByRole('button', { name: 'Leave household' }).click();
	await expect(page).toHaveURL('/onboarding/household');

	const stranger = await secondPerson(browser, baseURL!);
	await signIn(stranger, newPerson('stranger'));
	await stranger.goto(url);
	await expect(stranger.getByRole('heading', { level: 1 })).toHaveText('This invite was cancelled');
	await stranger.context().close();

	await page.getByRole('button', { name: 'Rejoin The Quiet House' }).click();
	await expect(page).toHaveURL('/');
	await page.goto('/household');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Quiet House');
	await expect(page.getByRole('listitem').filter({ hasText: '(you)' })).toContainText('Owner');
});

test('someone removed loses access and the link they saved to come back (D18)', async ({
	page,
	browser,
	baseURL
}) => {
	const { caregiver, person } = await twoPeople(page, browser, baseURL!);
	const { url } = await createLink(caregiver, baseURL!);

	await page.goto('/household');
	await page.getByRole('button', { name: `Remove ${person.name}` }).click();
	const sheet = page.getByRole('dialog');
	const confirm = sheet.getByRole('button', { name: `Remove ${person.name}` });
	expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(48);
	await confirm.click();
	await expect(page.getByText(`${person.name} removed`)).toBeVisible();
	await expect(page.getByText('No invites waiting.')).toBeVisible();

	await caregiver.goto('/household');
	await expect(caregiver).toHaveURL('/onboarding');
	await caregiver.goto(url);
	await expect(caregiver.getByRole('heading', { level: 1 })).toHaveText(
		'This invite was cancelled'
	);
	await caregiver.goto('/onboarding/household');
	await expect(caregiver.getByRole('button', { name: /^Rejoin/ })).toHaveCount(0);
	await caregiver.context().close();
});

test("a caregiver can leave but can't remove anyone, even by calling the API (D18)", async ({
	page,
	browser,
	baseURL
}) => {
	const { caregiver } = await twoPeople(page, browser, baseURL!);
	await caregiver.goto('/household');
	await expect(caregiver.getByRole('button', { name: /^Remove/ })).toHaveCount(0);

	const household = await caregiver.request.get('/api/v1/household');
	const { members } = await household.json();
	const ownerId = members.find((m: { role: string }) => m.role === 'owner').id;
	const refused = await caregiver.request.delete(`/api/v1/household/members/${ownerId}`, {
		headers: { origin: baseURL!, 'if-match': household.headers()['etag']! }
	});
	expect(refused.status()).toBe(403);
	await caregiver.context().close();
});

test('removing someone from an older page changes nothing, and says so (D18)', async ({
	page,
	browser,
	baseURL
}) => {
	const { caregiver, person } = await twoPeople(page, browser, baseURL!);
	await page.goto('/household');
	await page.getByRole('button', { name: `Remove ${person.name}` }).click();

	// They leave while this sheet is open.
	await caregiver.goto('/household');
	await caregiver.getByRole('button', { name: 'Leave household' }).click();
	await caregiver.getByRole('dialog').getByRole('button', { name: 'Leave household' }).click();
	await expect(caregiver).toHaveURL('/onboarding/household');
	await caregiver.context().close();

	await page
		.getByRole('dialog')
		.getByRole('button', { name: `Remove ${person.name}` })
		.click();
	await expect(page.getByText('The household changed a moment ago')).toBeVisible();
	await expect(page.getByRole('button', { name: `Remove ${person.name}` })).toHaveCount(0);
});
