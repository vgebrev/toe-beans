// The landing page's pictures of the app (backlog S21.2, ui.md §4.9): Today and the *Log practice*
// sheet, light and dark, on the Redmi Note 12 Pro's viewport, taken from the production build with
// a demo household. The page shows the app as it is, so they're captured, never drawn. After a
// change to Today, the log sheet or the outcome badges, run `pnpm landing:shots` and commit the
// images it writes to infra/edge/assets/landing/. Not part of `pnpm test:e2e`
// (playwright.landing.config.ts).
//
// The demo dog is Ripley, the owner's own, with the photo they chose for the page
// (fixtures/ripley.jpg). The household lives in a zone where it's mid-morning now, so the
// morning's practice is done and the afternoon's still planned whenever this runs; no zone shows
// on Today.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { blockMockFonts, jsonHeaders, newPerson, signIn } from './mock-sign-in.js';

const OUT = fileURLToPath(new URL('../../../infra/edge/assets/landing/', import.meta.url));
const PHOTO = readFileSync(new URL('./fixtures/ripley.jpg', import.meta.url));
/** Twice the viewport's 393 px: sharp on a phone at the size the page shows them. */
const WIDTH = 786;

/** A fixed-offset zone where it's 10:00–10:59 now. Etc/GMT's sign is inverted: Etc/GMT-2 is UTC+2. */
function morningZone(now: Date) {
	const offset = ((10 - now.getUTCHours() + 36) % 24) - 12;
	const zone = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(now);
	const at = (time: string, days = 0) =>
		new Date(Date.parse(`${today}T${time}:00Z`) + days * 86_400_000 - offset * 3_600_000);
	return { zone, today, at };
}

async function post(page: Page, baseURL: string, path: string, data: unknown) {
	const response = await page.request.post(path, {
		headers: jsonHeaders(baseURL),
		data: JSON.stringify(data)
	});
	expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
	return response.json();
}

async function save(screenshot: Buffer, name: string) {
	await sharp(screenshot)
		.resize(WIDTH)
		.webp({ quality: 88 })
		.toFile(OUT + name);
}

test('Today and the log sheet, light and dark', async ({ page, baseURL }) => {
	await blockMockFonts(page);
	await signIn(page, { ...newPerson('sam'), name: 'Sam' });
	const { zone, today, at } = morningZone(new Date());
	await post(page, baseURL!, '/api/v1/household', { name: 'Our household', timeZone: zone });
	const added = await page.request.post('/api/v1/dogs', {
		headers: { origin: baseURL! },
		multipart: {
			dog: JSON.stringify({ name: 'Ripley' }),
			photo: { name: 'ripley.jpg', mimeType: 'image/jpeg', buffer: PHOTO }
		}
	});
	expect(added.status()).toBe(201);
	const ripley = await added.json();

	const schedule = (exerciseId: string, time: string) =>
		post(page, baseURL!, '/api/v1/planned-sessions', {
			dogId: ripley.id,
			exerciseId,
			date: today,
			times: [time]
		});
	const nameGame = await schedule('name-game', '08:00');
	await schedule('recall-basics', '12:30');
	await schedule('stop-go-walking', '17:30');
	await post(page, baseURL!, '/api/v1/session-logs', {
		plannedSessionId: nameGame.id,
		outcome: 'partial',
		durationMin: 5,
		practisedAt: at('08:05').toISOString()
	});
	await post(page, baseURL!, '/api/v1/session-logs', {
		dogId: ripley.id,
		exerciseId: 'settle-on-a-mat',
		practisedAt: at('09:40').toISOString()
	});
	await post(page, baseURL!, '/api/v1/care-tasks', {
		dogId: ripley.id,
		category: 'parasite_prevention',
		title: 'Deworming',
		dueDate: at('12:00', 3).toISOString().slice(0, 10)
	});

	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
		await expect(page.getByText('Deworming')).toBeVisible();
		await page.waitForLoadState('networkidle');
		await save(await page.screenshot(), `today-${scheme}.webp`);

		await page.getByRole('button', { name: 'Log Recall basics for Ripley' }).click();
		const sheet = page.getByRole('dialog', { name: 'Log practice' });
		await expect(sheet).toBeVisible();
		// The sheet's slide-in, 200 ms (ui.md §6.4).
		await page.waitForTimeout(400);
		await save(await sheet.screenshot(), `log-${scheme}.webp`);
	}
});
