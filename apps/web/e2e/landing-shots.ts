// The landing page's pictures of the app (backlog S21.2, ui.md §4.9): Today and the *Log practice*
// sheet, light and dark, and the share card for link previews (S21.3), on the Redmi Note 12 Pro's viewport, taken from the production build with
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
import { markHeart, markLetters, markToes, markViewBox } from '../src/lib/assets/brand/mark.js';
import { blockMockFonts, jsonHeaders, newPerson, signIn } from './mock-sign-in.js';

// The share card is drawn from the Today capture, so the two run in order.
test.describe.configure({ mode: 'serial' });

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

/** As a data URL, so the card's page needs no server. */
const dataUrl = (file: string, type: string) =>
	`data:${type};base64,${readFileSync(new URL(file, `file://${OUT}`)).toString('base64')}`;

test('the share card for link previews', async ({ browser }) => {
	const fonts = `file://${OUT}../edge-fonts/`;
	const font = (name: string) =>
		`data:font/woff2;base64,${readFileSync(new URL(`${name}-latin.woff2`, fonts)).toString('base64')}`;
	const mark = `<svg viewBox="0 0 ${markViewBox.width} ${markViewBox.height}" class="mark">
		<path fill="#8A4B1F" fill-rule="evenodd" d="${markLetters}"/>
		<g fill="#C98A4B"><path d="${markHeart}"/>${markToes
			.map(
				(t) =>
					`<ellipse cx="${t.cx}" cy="${t.cy}" rx="${t.rx}" ry="${t.ry}" transform="rotate(${t.deg} ${t.cx} ${t.cy})"/>`
			)
			.join('')}</g></svg>`;
	const page = await browser.newPage({
		viewport: { width: 1200, height: 630 },
		deviceScaleFactor: 1
	});
	await page.setContent(`<!doctype html><html><head><style>
		@font-face { font-family: Nunito; font-weight: 200 1000; src: url(${font('nunito')}); }
		@font-face { font-family: Fredoka; font-weight: 300 700; src: url(${font('fredoka')}); }
		body { margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative;
			background: #FFFBF5; color: #2B1D14; font-family: Nunito, sans-serif; }
		.text { position: absolute; left: 80px; top: 0; bottom: 0; width: 640px; display: flex;
			flex-direction: column; justify-content: center; gap: 28px; }
		.brand { display: flex; align-items: center; gap: 14px; font: 700 34px Fredoka, sans-serif; }
		.mark { width: 52px; height: 55px; }
		h1 { margin: 0; font: 600 76px/1.04 Fredoka, sans-serif; letter-spacing: -0.01em; }
		p { margin: 0; font-size: 28px; line-height: 1.4; color: #6B5444; }
		.beans { position: absolute; right: 0; top: 0; width: 460px; height: 630px; }
		.beans ellipse { fill: #C98A4B; opacity: 0.3; }
		.phone { position: absolute; right: 90px; top: 64px; width: 300px; height: 634px;
			border: 10px solid #2B1D14; border-radius: 44px; overflow: hidden; background: #FFFBF5;
			box-shadow: 0 32px 64px rgb(43 29 20 / 0.2); }
		.phone img { display: block; width: 300px; }
	</style></head><body>
		<svg class="beans" viewBox="0 0 460 630">
			<ellipse cx="60" cy="120" rx="46" ry="38" transform="rotate(62 60 120)"/>
			<ellipse cx="190" cy="34" rx="52" ry="40" transform="rotate(-82 190 34)"/>
			<ellipse cx="410" cy="90" rx="46" ry="36" transform="rotate(-56 410 90)"/>
			<ellipse cx="420" cy="520" rx="50" ry="40" transform="rotate(-51 420 520)"/>
		</svg>
		<div class="text">
			<div class="brand">${mark}Toe Beans</div>
			<h1>Raise your puppy together.</h1>
			<p>Puppy training and care for the whole household. Free, private, made in South Africa.</p>
		</div>
		<div class="phone"><img src="${dataUrl('today-light.webp', 'image/webp')}" alt=""></div>
	</body></html>`);
	await page.evaluate(() => document.fonts.ready);
	await sharp(await page.screenshot())
		.png({ compressionLevel: 9, palette: true, quality: 90 })
		.toFile(`${OUT}share.png`);
	await page.close();
});
