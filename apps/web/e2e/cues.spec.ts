// The shared cue dictionary (FR-04, NFR-13, scenario 9; ui.md §4.6, §5.2). Each test brings its
// own household, so it sees only its own cues.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { blockMockFonts, createHousehold, newPerson, signIn } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });

async function household(page: Page, baseURL: string, name?: string) {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL, name);
}

async function addCue(page: Page, baseURL: string, label: string, meaning = 'Bottom down.') {
	const response = await page.request.post('/api/v1/cues', {
		headers: json(baseURL),
		data: JSON.stringify({ label, meaning })
	});
	expect(response.status()).toBe(201);
	return (await response.json()) as { id: string; etag: string };
}

test('adding, editing and deleting cues from More', async ({ page, baseURL }) => {
	await household(page, baseURL!);
	await page.goto('/more');
	await page.getByRole('link', { name: /Cue dictionary/ }).click();
	await expect(page).toHaveURL('/cues');
	await expect(page.getByRole('heading', { name: 'No cues yet' })).toBeVisible();

	await page.getByRole('button', { name: 'Add a cue' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add a cue' });
	// Nothing filled in: the button stays enabled and says what's missing (ui.md §5.1).
	await sheet.getByRole('button', { name: 'Add cue' }).click();
	await expect(sheet.getByText('Enter the cue word.')).toBeVisible();
	await expect(sheet.getByText('Say what your dog does on this cue.')).toBeVisible();
	await sheet.getByLabel('Cue word').fill(' Sit ');
	await sheet.getByLabel('What it means').fill('Bottom on the floor until released.');
	await sheet.getByLabel(/Hand signal/).fill('Flat hand, palm up, raised');
	await sheet.getByLabel(/Reward/).fill('A treat at nose height');
	await sheet.getByRole('button', { name: 'Add cue' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('Added “Sit”.')).toBeVisible();
	const sit = page.getByRole('button', { name: /^Sit/ });
	await expect(sit).toContainText('Bottom on the floor until released.');
	await expect(sit).toContainText('Hand signal: Flat hand, palm up, raised');
	await expect(sit).toContainText('Last edited by Test owner, just now');

	// The same word again, whatever the case, is refused by the server.
	await page.getByRole('button', { name: 'Add a cue' }).click();
	const again = page.getByRole('dialog', { name: 'Add a cue' });
	await again.getByLabel('Cue word').fill('sit');
	await again.getByLabel('What it means').fill('Something else.');
	await again.getByRole('button', { name: 'Add cue' }).click();
	await expect(again.getByText("There's already a cue called “Sit”.")).toBeVisible();
	await again.getByLabel('Cue word').fill('Down');
	await again.getByRole('button', { name: 'Add cue' }).click();
	await expect(again).toBeHidden();
	// Alphabetical.
	await expect(page.getByRole('list', { name: 'Cues' }).getByRole('listitem')).toHaveText([
		/^Down/,
		/^Sit/
	]);

	await sit.click();
	const edit = page.getByRole('dialog', { name: 'Edit cue' });
	await edit.getByRole('button', { name: 'Save cue' }).click();
	await expect(edit.getByText("Nothing's changed, so there's nothing to save.")).toBeVisible();
	await edit.getByLabel(/Hand signal/).fill('');
	await edit.getByLabel(/Notes/).fill('Ask once, then wait.');
	await edit.getByRole('button', { name: 'Save cue' }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByText('Saved “Sit”.')).toBeVisible();
	await expect(sit).not.toContainText('Hand signal');
	await expect(sit).toContainText('Ask once, then wait.');

	await sit.click();
	await page.getByRole('button', { name: 'Delete this cue' }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete “Sit”?' });
	await confirm.getByRole('button', { name: 'Delete “Sit”' }).click();
	await expect(confirm).toBeHidden();
	await expect(page.getByText('Deleted “Sit”.')).toBeVisible();
	await expect(page.getByRole('list', { name: 'Cues' }).getByRole('listitem')).toHaveText([
		/^Down/
	]);
});

test('a change made elsewhere is never overwritten without asking', async ({ page, baseURL }) => {
	await household(page, baseURL!);
	const cue = await addCue(page, baseURL!, 'Leave it', 'Ignore it.');
	await page.goto('/cues');
	await page.getByRole('button', { name: /^Leave it/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Edit cue' });
	await sheet.getByLabel('What it means').fill('Look away from it, then at me.');

	// Meanwhile, someone saves a change on another phone.
	const elsewhere = await page.request.patch(`/api/v1/cues/${cue.id}`, {
		headers: { ...json(baseURL!), 'if-match': cue.etag },
		data: JSON.stringify({ meaning: 'Turn away from it.' })
	});
	expect(elsewhere.status()).toBe(200);

	await sheet.getByRole('button', { name: 'Save cue' }).click();
	await expect(sheet.getByText('Test owner changed this a moment ago.')).toBeVisible();
	// What was typed is still there, and nothing saved over theirs.
	await expect(sheet.getByLabel('What it means')).toHaveValue('Look away from it, then at me.');
	await sheet.getByRole('button', { name: 'See their version' }).click();
	await expect(sheet.getByLabel('What it means')).toHaveValue('Turn away from it.');
	await expect(sheet.getByText("This is Test owner's version.")).toBeVisible();

	// Again, and this time overwrite theirs.
	const latest = await (await page.request.get(`/api/v1/cues/${cue.id}`)).json();
	await page.request.patch(`/api/v1/cues/${cue.id}`, {
		headers: { ...json(baseURL!), 'if-match': latest.etag },
		data: JSON.stringify({ meaning: 'Third version.' })
	});
	await sheet.getByLabel('What it means').fill('Mine wins.');
	await sheet.getByRole('button', { name: 'Save cue' }).click();
	await sheet.getByRole('button', { name: 'Overwrite with mine' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('button', { name: /^Leave it/ })).toContainText('Mine wins.');

	// Deleted elsewhere while open: it can be added again from what was typed.
	await page.getByRole('button', { name: /^Leave it/ }).click();
	const current = await (await page.request.get(`/api/v1/cues/${cue.id}`)).json();
	await page.request.delete(`/api/v1/cues/${cue.id}`, {
		headers: { origin: baseURL!, 'if-match': current.etag }
	});
	const reopened = page.getByRole('dialog', { name: 'Edit cue' });
	await reopened.getByLabel(/Notes/).fill('Back again.');
	await reopened.getByRole('button', { name: 'Save cue' }).click();
	await expect(reopened.getByText('Someone deleted this cue a moment ago.')).toBeVisible();
	await reopened.getByRole('button', { name: 'Add it again' }).click();
	await expect(reopened).toBeHidden();
	await expect(page.getByText('Added “Leave it”.')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Leave it/ })).toContainText('Back again.');
});

async function secondPerson(browser: Browser, baseURL: string): Promise<Page> {
	const context = await browser.newContext({ baseURL, storageState: undefined });
	const page = await context.newPage();
	await blockMockFonts(page);
	return page;
}

test('scenario 9: an outsider reaches no cue by its ID', async ({ page, browser, baseURL }) => {
	await household(page, baseURL!);
	const cue = await addCue(page, baseURL!, 'Sit');
	const outsider = await secondPerson(browser, baseURL!);
	await household(outsider, baseURL!, 'The Others');

	expect((await outsider.request.get(`/api/v1/cues/${cue.id}`)).status()).toBe(404);
	const change = await outsider.request.patch(`/api/v1/cues/${cue.id}`, {
		headers: { ...json(baseURL!), 'if-match': cue.etag },
		data: JSON.stringify({ meaning: 'Taken over.' })
	});
	expect(change.status()).toBe(404);
	const remove = await outsider.request.delete(`/api/v1/cues/${cue.id}`, {
		headers: { origin: baseURL!, 'if-match': cue.etag }
	});
	expect(remove.status()).toBe(404);
	expect(await (await outsider.request.get('/api/v1/cues')).json()).toEqual({ cues: [] });
	// Untouched for its own household.
	const own = await (await page.request.get(`/api/v1/cues/${cue.id}`)).json();
	expect(own).toMatchObject({ meaning: 'Bottom down.', etag: cue.etag });
	await outsider.context().close();
});
