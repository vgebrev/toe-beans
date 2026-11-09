// Dogs and their photos (FR-02, scenarios 2 and 9; ui.md J1 step 4, §2.2, §4.5). Each test brings
// its own household, so the switcher sees only that test's dogs.
import { expect, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
	addDog,
	blockMockFonts,
	createHousehold,
	newPerson,
	photoFile,
	signIn
} from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

async function household(page: Page, baseURL: string, name?: string) {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL, name);
}

/** Whether the sheet fits on screen: nothing to scroll to, and its confirm button fully shown. */
async function fitsOnScreen(sheet: Locator, confirm: string) {
	await expect(sheet.getByRole('button', { name: confirm })).toBeInViewport({ ratio: 1 });
	expect(await sheet.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
}

/** Whether the image has loaded with real pixels. */
const loaded = (page: Page, selector: string) =>
	page.locator(selector).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);

test('adding a dog: framed photo first, then the details, then its profile', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!);
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Add your dog' })).toBeVisible();
	await page.getByRole('link', { name: 'Add a dog' }).click();

	await expect(page).toHaveURL('/dogs/new');
	// The photo is chosen and framed in its own sheet, which has the one confirm button.
	await page.getByRole('button', { name: 'Add photo' }).click();
	const sheet = page.getByRole('dialog', { name: 'Add a photo' });
	await sheet.getByRole('button', { name: 'Use photo' }).click();
	await expect(sheet.getByText('Choose a photo first')).toBeVisible();
	await sheet.getByLabel('Gallery').setInputFiles(await photoFile());
	const frame = sheet.getByRole('application', { name: /Photo framing/ });
	await expect(frame).toBeVisible();
	await fitsOnScreen(sheet, 'Use photo');
	// Dragging moves the photo; it can't leave part of the square empty.
	const photo = frame.locator('img');
	const before = await photo.getAttribute('style');
	const box = (await frame.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	expect(await photo.getAttribute('style')).not.toBe(before);
	await sheet.getByRole('button', { name: 'Use photo' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('img', { name: 'Your dog, ready to save' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();

	await page.getByLabel('Name', { exact: true }).fill('  Rosie ');
	await page.getByLabel('Birth date').fill('2026-06-01');
	await page.getByLabel(/Adoption date/).fill('2026-08-15');
	await page.getByLabel(/Notes/).fill('Loves cheese.\nScared of the hoover.');
	await page.getByRole('button', { name: 'Add dog' }).click();

	await expect(page).toHaveURL(/\/dogs\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rosie');
	await expect(page.getByText('Scared of the hoover.')).toBeVisible();
	await expect(page.getByText(/^Adopted \d+ (weeks?|months?) ago$/)).toBeVisible();
	await expect.poll(() => loaded(page, 'img[src*="size=large"]')).toBe(true);
	// One dog: the switcher is just its avatar, which opens the profile.
	await page.goto('/');
	await page.getByRole('link', { name: 'Rosie' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rosie');
});

test('the stored photo is the re-encoded square, with no location left', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!);
	const dog = await addDog(page, baseURL!);
	for (const [size, pixels] of [
		['thumb', 256],
		['large', 1024]
	] as const) {
		const response = await page.request.get(dog.photo[size]);
		expect(response.status()).toBe(200);
		expect(response.headers()).toMatchObject({
			'content-type': 'image/webp',
			'cache-control': 'private, max-age=86400'
		});
		const meta = await sharp(await response.body()).metadata();
		expect(meta).toMatchObject({ format: 'webp', width: pixels, height: pixels });
		expect(meta.exif).toBeUndefined();
		// The browser keeps it: asking again with its ETag is a 304.
		const again = await page.request.get(dog.photo[size], {
			headers: { 'if-none-match': response.headers().etag! }
		});
		expect(again.status()).toBe(304);
	}
});

test('changing the photo, editing and archiving, from the profile', async ({ page, baseURL }) => {
	await household(page, baseURL!);
	const dog = await addDog(page, baseURL!, {
		name: 'Rosie',
		birth: { date: '2026-07-01', precision: 'month' }
	});
	await page.goto(`/dogs/${dog.id}`);
	await expect(page.getByText(/^about \d+ months$/)).toBeVisible();

	await page.getByRole('button', { name: 'Change photo' }).click();
	const sheet = page.getByRole('dialog', { name: 'Change photo' });
	await sheet.getByLabel('Gallery').setInputFiles(await photoFile(['#4B7520', '#A13A86']));
	await expect(sheet.getByRole('application', { name: /Photo framing/ })).toBeVisible();
	await fitsOnScreen(sheet, 'Save photo');
	await sheet.getByRole('button', { name: 'Save photo' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText('Photo changed.')).toBeVisible();
	const large = page.getByRole('img', { name: "Rosie's photo" }).locator('img');
	await expect(large).not.toHaveAttribute('src', dog.photo.large);
	// The old photo's URL now serves the new photo, so a stale link never shows a deleted one.
	expect((await page.request.get(dog.photo.large)).status()).toBe(200);

	await page.getByRole('link', { name: 'Edit details' }).click();
	await expect(page.getByLabel('Months old')).toHaveValue(/^\d+$/);
	await page.getByLabel('Name', { exact: true }).fill('Rosie Posie');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rosie Posie');

	await page.getByRole('button', { name: 'More for Rosie Posie' }).click();
	await page.getByRole('button', { name: 'Archive Rosie Posie' }).click();
	await expect(page.getByRole('dialog', { name: 'Archive Rosie Posie?' })).toBeVisible();
	await page.getByRole('button', { name: 'Archive Rosie Posie' }).click();
	await expect(page.getByText(/is archived: their history stays/)).toBeVisible();
	await page.goto('/dogs');
	await expect(page.getByRole('region', { name: 'Archived' })).toContainText('Rosie Posie');
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Add your dog' })).toBeVisible();

	await page.goto(`/dogs/${dog.id}`);
	await page.getByRole('button', { name: 'Bring Rosie Posie back' }).click();
	await expect(page.getByText('Rosie Posie is back.')).toBeVisible();
});

test('an edit made elsewhere is not overwritten (NFR-13)', async ({ page, baseURL }) => {
	await household(page, baseURL!);
	const dog = await addDog(page, baseURL!);
	await page.goto(`/dogs/${dog.id}/edit`);
	const meanwhile = await page.request.patch(`/api/v1/dogs/${dog.id}`, {
		headers: { origin: baseURL!, 'content-type': 'application/json', 'if-match': dog.etag },
		data: JSON.stringify({ name: 'Milo' })
	});
	expect(meanwhile.status()).toBe(200);

	await page.getByLabel('Name', { exact: true }).fill('Bean');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('alert')).toContainText('Nothing was saved.');
	await page.getByRole('button', { name: 'See their version' }).click();
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Milo');
});

test('scenario 2: two dogs, switched between, the choice kept on this phone', async ({
	page,
	baseURL
}) => {
	await household(page, baseURL!);
	await addDog(page, baseURL!, { name: 'Rosie' });
	await addDog(page, baseURL!, { name: 'Milo' });

	await page.goto('/');
	const switcher = page.getByRole('group', { name: 'Show dog' });
	await expect(switcher.getByRole('button')).toHaveText(['Rosie', 'Milo', 'All dogs']);
	await expect(switcher.getByRole('button', { name: 'All dogs' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await switcher.getByRole('button', { name: 'Milo' }).click();
	await expect(switcher.getByRole('button', { name: 'Milo' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.reload();
	await expect(
		page.getByRole('group', { name: 'Show dog' }).getByRole('button', { name: 'Milo' })
	).toHaveAttribute('aria-pressed', 'true');
	await page.goto('/plan');
	await expect(
		page.getByRole('group', { name: 'Show dog' }).getByRole('button', { name: 'Milo' })
	).toHaveAttribute('aria-pressed', 'true');

	await page.goto('/more');
	await expect(page.getByRole('link', { name: /Dogs/ })).toContainText('Rosie and Milo');
});

test("scenario 9: another household can't reach a dog or its photo by ID", async ({
	page,
	browser,
	baseURL
}) => {
	await household(page, baseURL!, 'The Does');
	const dog = await addDog(page, baseURL!);

	const context = await browser.newContext({ baseURL, storageState: undefined });
	const outsider = await context.newPage();
	await blockMockFonts(outsider);
	await household(outsider, baseURL!, 'The Outsiders');
	const headers = { origin: baseURL!, 'if-match': dog.etag };
	const attempts = [
		outsider.request.get(`/api/v1/dogs/${dog.id}`),
		outsider.request.get(dog.photo.thumb),
		outsider.request.get(dog.photo.large),
		outsider.request.patch(`/api/v1/dogs/${dog.id}`, {
			headers: { ...headers, 'content-type': 'application/json' },
			data: JSON.stringify({ name: 'Taken', archived: true })
		}),
		outsider.request.put(`/api/v1/dogs/${dog.id}/photo`, {
			headers,
			multipart: { photo: await photoFile() }
		})
	];
	for (const response of await Promise.all(attempts)) {
		expect(response.status()).toBe(404);
		// The same answer as for a dog that doesn't exist: nothing says it's somewhere else.
		expect(await response.json()).toMatchObject({ type: 'toe-beans/not-found' });
	}
	expect((await (await outsider.request.get('/api/v1/dogs')).json()).dogs).toEqual([]);
	await outsider.goto(`/dogs/${dog.id}`);
	await expect(outsider.getByRole('heading', { name: "We couldn't find that" })).toBeVisible();
	await context.close();

	// Signed out, the photo is a 401 like the rest of the API.
	const signedOut = await browser.newContext({ baseURL, storageState: undefined });
	expect((await signedOut.request.get(dog.photo.thumb)).status()).toBe(401);
	await signedOut.close();

	expect(await (await page.request.get(`/api/v1/dogs/${dog.id}`)).json()).toMatchObject({
		name: 'Rosie',
		archived: false
	});
});

test('J2: the invitation names the dogs to help care for', async ({ page, browser, baseURL }) => {
	await household(page, baseURL!, 'The Does');
	await addDog(page, baseURL!, { name: 'Rosie' });
	await addDog(page, baseURL!, { name: 'Milo' });
	const response = await page.request.post('/api/v1/household/invitations', {
		headers: { origin: baseURL!, 'content-type': 'application/json' },
		data: JSON.stringify({ kind: 'link' })
	});
	const { url } = await response.json();

	const context = await browser.newContext({ baseURL, storageState: undefined });
	const invitee = await context.newPage();
	await invitee.goto(new URL(url).pathname);
	await expect(invitee.getByRole('heading', { level: 1 })).toHaveText(
		"You've been invited to join The Does"
	);
	await expect(invitee.getByText('to help care for Rosie and Milo')).toBeVisible();
	await context.close();
});
