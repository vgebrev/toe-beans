// The household's export on More (FR-16, architecture D46): an owner downloads a ZIP of the
// household's records and photos; a caregiver is told who can.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { blockMockFonts, jsonHeaders, newPerson, ownHousehold, signIn } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

test('an owner downloads the household with its photos', async ({ page, baseURL }) => {
	const [rosie] = await ownHousehold(page, baseURL!, { name: 'The Exporters' });
	const cue = await page.request.post('/api/v1/cues', {
		headers: jsonHeaders(baseURL!),
		data: JSON.stringify({ label: 'Touch', meaning: 'Nose to my palm.' })
	});
	expect(cue.status()).toBe(201);

	await page.goto('/more');
	const button = page.getByRole('button', { name: 'Download a copy' });
	expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
	const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
	await expect(page.getByText("Downloaded. It's in your downloads.")).toBeVisible();

	expect(download.suggestedFilename()).toMatch(/^toe-beans-export-\d{4}-\d{2}-\d{2}\.zip$/);
	const files = unzipSync(await readFile(await download.path()));
	expect(Object.keys(files).sort()).toEqual([
		'README.txt',
		'household.json',
		`photos/${rosie!.id}.webp`
	]);
	const photo = files[`photos/${rosie!.id}.webp`]!;
	expect(new TextDecoder().decode(photo.slice(8, 12))).toBe('WEBP');

	const text = new TextDecoder().decode(files['household.json']);
	const doc = JSON.parse(text);
	expect(doc).toMatchObject({
		schemaVersion: 1,
		household: { name: 'The Exporters', members: [{ role: 'owner', displayName: 'Test owner' }] },
		dogs: [{ id: rosie!.id, name: 'Rosie', photo: `photos/${rosie!.id}.webp` }],
		cues: [{ label: 'Touch', meaning: 'Nose to my palm.' }]
	});
	// The mock provider's subjects start with the person's label.
	expect(text).not.toMatch(/owner-[a-z0-9]{8,}/);
});

test('a caregiver is told who can download a copy', async ({ page, browser, baseURL }) => {
	await ownHousehold(page, baseURL!, { name: 'The Does', dogs: [] });
	const invite = await page.request.post('/api/v1/household/invitations', {
		headers: jsonHeaders(baseURL!),
		data: JSON.stringify({ kind: 'link' })
	});
	const { url } = await invite.json();
	const token = new URL(url).pathname.split('/').pop();

	const context = await browser.newContext({ baseURL, storageState: undefined });
	const caregiver = await context.newPage();
	await blockMockFonts(caregiver);
	await signIn(caregiver, newPerson('alex'));
	const accepted = await caregiver.request.post(`/api/v1/invitations/${token}/accept`, {
		headers: jsonHeaders(baseURL!)
	});
	expect(accepted.ok()).toBe(true);

	await caregiver.goto('/more');
	await expect(
		caregiver.getByText(/An owner of The Does \(Test owner\) can download/)
	).toBeVisible();
	await expect(caregiver.getByRole('button', { name: 'Download a copy' })).toHaveCount(0);
	expect((await caregiver.request.get('/api/v1/household/export')).status()).toBe(403);
	await context.close();
});
