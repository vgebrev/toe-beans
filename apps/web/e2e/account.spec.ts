// The display name on More → Account (ui.md §4.7): the app keeps the name the person chooses,
// and edits from two places never silently overwrite each other (NFR-13).
import { expect, test, type Page } from '@playwright/test';
import {
	blockMockFonts,
	createHousehold,
	newPerson,
	signIn,
	type TestPerson
} from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

/** Signs in, with a household the first time, and opens More. */
async function signInAs(page: Page, person: TestPerson, baseURL: string, firstTime = true) {
	await signIn(page, person, '/more');
	if (firstTime) {
		await createHousehold(page, baseURL);
		await page.goto('/more');
	}
	await expect(page).toHaveURL('/more');
}

test('a chosen name is saved and survives signing in again', async ({ page, context, baseURL }) => {
	const person = newPerson();
	await signInAs(page, person, baseURL!);

	const name = page.getByLabel('Your name');
	const save = page.getByRole('button', { name: 'Save' });
	await expect(name).toHaveValue(person.name);
	await expect(save).toBeDisabled();
	expect((await name.boundingBox())!.height).toBeGreaterThanOrEqual(48);

	await name.fill('  Sam   the walker ');
	await save.click();
	await expect(page.getByText('Saved')).toBeVisible();
	await expect(name).toHaveValue('Sam the walker');

	await page.reload();
	await expect(name).toHaveValue('Sam the walker');

	// The provider's name doesn't take it back.
	await context.clearCookies();
	await signInAs(page, { ...person, name: 'Provider Name' }, baseURL!, false);
	await expect(name).toHaveValue('Sam the walker');
});

test('a save from an older page offers both versions', async ({ page, context, baseURL }) => {
	await signInAs(page, newPerson(), baseURL!);
	const other = await context.newPage();
	await other.goto('/more');

	await page.getByLabel('Your name').fill('From the phone');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved')).toBeVisible();

	await other.getByLabel('Your name').fill('From the old tab');
	await other.getByRole('button', { name: 'Save' }).click();
	await expect(other.getByRole('alert')).toContainText('changed somewhere else');
	// Nothing was overwritten, and the typed name is still there.
	await expect(other.getByLabel('Your name')).toHaveValue('From the old tab');

	await other.getByRole('button', { name: 'See the new name' }).click();
	await expect(other.getByLabel('Your name')).toHaveValue('From the phone');

	await other.getByLabel('Your name').fill('From the old tab');
	await other.getByRole('button', { name: 'Save' }).click();
	await expect(other.getByText('Saved')).toBeVisible();
});

test('the API needs If-Match and refuses a stale one', async ({ page, baseURL }) => {
	await signInAs(page, newPerson(), baseURL!);
	const headers = { origin: baseURL!, 'content-type': 'application/json' };
	const me = await page.request.get('/api/v1/me');
	expect(me.status()).toBe(200);
	const etag = me.headers()['etag']!;
	const data = JSON.stringify({ displayName: 'Sam' });

	expect((await page.request.patch('/api/v1/me', { headers, data })).status()).toBe(428);
	const ok = await page.request.patch('/api/v1/me', {
		headers: { ...headers, 'if-match': etag },
		data
	});
	expect(ok.status()).toBe(200);
	const stale = await page.request.patch('/api/v1/me', {
		headers: { ...headers, 'if-match': etag },
		data
	});
	expect(stale.status()).toBe(412);
	expect(await stale.json()).toMatchObject({ type: 'toe-beans/conflict' });
});
