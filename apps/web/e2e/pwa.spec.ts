// The PWA around the pages (S13; NFR-03, NFR-04, NFR-09; ui.md §5.2, §6.1, §6.3): the offline
// and new-version banners, the fallback pages, saves while offline (scenario 8), the loading
// skeleton, installing and the home screen shortcuts. Each test brings its own household.
import { expect, test, type Page } from '@playwright/test';
import { blockMockFonts, ownHousehold } from './mock-sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

/** Until the service worker has installed, cached the app and taken over the page. */
async function waitForServiceWorker(page: Page) {
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) {
			await new Promise((resolve) =>
				navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
			);
		}
	});
}

const banner = (page: Page) => page.getByText("You're offline. Changes can't be saved right now.");

test('the offline banner shows while the phone is offline, and goes when it is back', async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await expect(banner(page)).toBeHidden();

	await context.setOffline(true);
	await expect(banner(page)).toBeVisible();
	// At the top of the screen, whatever the page.
	expect((await banner(page).boundingBox())!.y).toBeLessThan(60);

	await context.setOffline(false);
	await expect(banner(page)).toBeHidden();
});

test('a new deployment shows Refresh, which loads it; never while offline', async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	const update = page.getByText('A new version of Toe Beans is ready.');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
	await expect(update).toBeHidden();

	// Kit checks _app/version.json when the app comes back to the front.
	await page.route('**/_app/version.json', (route) =>
		route.fulfill({ json: { version: 'a-newer-build' } })
	);
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(update).toBeVisible();
	expect((await update.boundingBox())!.y).toBeLessThan(60);

	await context.setOffline(true);
	await expect(banner(page)).toBeVisible();
	await expect(update).toBeHidden();
	await context.setOffline(false);
	await expect(update).toBeVisible();

	await page.unroute('**/_app/version.json');
	await page.getByRole('button', { name: 'Refresh' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(update).toBeHidden();
});

test('scenario 8: a save offline fails at once, keeps everything, and Retry saves it once back', async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Add' })
		.getByRole('button', { name: /Record event/ })
		.click();
	const sheet = page.getByRole('dialog', { name: 'Record event' });
	await sheet.getByRole('radio', { name: 'Barking' }).click();
	await sheet.getByLabel('Notes').fill('At the postman');

	await context.setOffline(true);
	const sent: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'POST') sent.push(request.url());
	});
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText("Couldn't save — check your connection.")).toBeVisible();
	expect(sent).toEqual([]);
	await expect(sheet.getByLabel('Notes')).toHaveValue('At the postman');
	await expect(sheet.getByRole('radio', { name: 'Barking' })).toBeChecked();

	await context.setOffline(false);
	await sheet.getByRole('button', { name: 'Retry' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText("Recorded Rosie's barking.")).toBeVisible();
});

test("a page opened offline in the app still opens, and says its data couldn't load", async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await waitForServiceWorker(page);
	// The service worker has the app's code, so the page opens; its data can't load.
	await context.setOffline(true);
	await context.route('**/api/v1/**', (route) => route.abort('internetdisconnected'));

	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plan' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');
	await expect(page.getByText("Couldn't load the plan — check your connection")).toBeVisible();
	await expect(banner(page)).toBeVisible();
});

test('a slow page shows the skeleton, then "Waking up Toe Beans…" (NFR-09)', async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await context.route('**/api/v1/planned-sessions*', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 3500));
		await route.continue();
	});

	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plan' }).click();
	await expect(page.locator('[aria-busy="true"]')).toBeVisible();
	await expect(page.getByText('Waking up Toe Beans…')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');
	await expect(page.locator('[aria-busy="true"]')).toBeHidden();
});

test('with the service worker in place, a page load with no connection shows the offline page', async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await waitForServiceWorker(page);

	await context.setOffline(true);
	await page.goto('/history');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're offline");
	await expect(page).toHaveURL('/history');
	// In the app's own fonts, from the cache.
	await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
		'font-family',
		/^"Fredoka Variable"/
	);
	const fonts = await page.evaluate(async () => {
		await document.fonts.ready;
		return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
	});
	expect(fonts).toEqual(expect.arrayContaining(['Nunito Variable', 'Fredoka Variable']));

	// Still offline, Try again says so rather than showing the same page again.
	await page.getByRole('link', { name: 'Try again' }).click();
	await expect(page.getByText("Still can't reach Toe Beans.")).toBeVisible();

	// Back online, it loads the page that was asked for by itself.
	await context.setOffline(false);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('History');
});

test('a fallback page stood in for a nested page, as a reminder opens, still loads its CSS and script', async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await waitForServiceWorker(page);

	// A reminder's deep link (S17.5): the cached page's asset paths must not depend on where it
	// was first fetched from.
	await context.setOffline(true);
	await page.goto('/settings/notifications?test=arrived');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're offline");
	await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
		'font-family',
		/^"Fredoka Variable"/
	);
	// The script runs: Try again checks rather than doing nothing.
	await page.getByRole('link', { name: 'Try again' }).click();
	await expect(page.getByText("Still can't reach Toe Beans.")).toBeVisible();

	await context.setOffline(false);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
});

test('Try again on the offline page loads the page once the connection is back', async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await waitForServiceWorker(page);
	await context.setOffline(true);
	await page.goto('/history');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're offline");

	// Without the online event, as when it comes before the connection really works.
	await page.evaluate(() =>
		window.addEventListener('online', (event) => event.stopImmediatePropagation(), {
			capture: true
		})
	);
	await context.setOffline(false);
	// Clicked from the page: the reload comes after the check, which Playwright's own click
	// doesn't wait out, and it ends this script's page, hence the catch.
	await page
		.evaluate(() => document.querySelector<HTMLElement>('a[data-sveltekit-reload]')!.click())
		.catch(() => undefined);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('History');
});

test('the service worker precaches the app and its fallback pages, and only Latin fonts', async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	const cached = await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		// Installing fills the cache before the worker is ready.
		const names = await caches.keys();
		const cache = await caches.open(names.find((n) => n.startsWith('toe-beans-'))!);
		return (await cache.keys()).map((request) => new URL(request.url).pathname);
	});
	expect(cached).toEqual(expect.arrayContaining(['/offline', '/unreachable', '/waking']));
	const fonts = cached.filter((path) => path.endsWith('.woff2'));
	expect(fonts.length).toBe(2);
	expect(fonts.every((path) => /-latin-wght-normal\./.test(path))).toBe(true);
	// Never anything with household data.
	expect(cached.some((path) => path.startsWith('/api/') || path === '/')).toBe(false);
});

test("the service worker's waking page is a skeleton that says it's waking up", async ({
	page
}) => {
	await page.goto('/waking');
	await expect(page.locator('[aria-busy="true"]')).toBeVisible();
	await expect(page.getByText('Waking up Toe Beans…')).toBeVisible();
});

/** What Chrome sends when it would install the app, with the dialog's answer. */
async function offerInstall(page: Page, outcome: 'accepted' | 'dismissed') {
	await page.evaluate((outcome) => {
		const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
			prompt: async () => undefined,
			userChoice: Promise.resolve({ outcome })
		});
		window.dispatchEvent(event);
	}, outcome);
}

test('Today offers installing once the browser does, and the browser installs it', async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	const install = page.getByRole('button', { name: 'Install Toe Beans on this device' });
	await expect(install).toBeHidden();

	await offerInstall(page, 'accepted');
	await install.click();
	await expect(page.getByText('Installed. Open Toe Beans from your home screen')).toBeVisible();
});

test('the install banner, once dismissed, stays away', async ({ page, baseURL }) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await offerInstall(page, 'dismissed');
	await page.getByRole('button', { name: 'Not now' }).click();
	await expect(page.getByRole('button', { name: 'Install Toe Beans on this device' })).toBeHidden();

	await page.reload();
	await offerInstall(page, 'dismissed');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
	await expect(page.getByRole('button', { name: 'Install Toe Beans on this device' })).toBeHidden();
});

test('More shows whether Toe Beans is installed, with Install when the browser offers it', async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/more');
	const app = page.getByRole('region', { name: 'App', exact: true });
	await expect(app).toContainText("Toe Beans isn't installed in this browser.");
	await expect(app).toContainText('Add to Home screen');

	await offerInstall(page, 'accepted');
	await app.getByRole('button', { name: 'Install Toe Beans' }).click();
	await expect(app).toContainText('Installed. Open Toe Beans from your home screen');
});

test('the manifest offers Log training and Record event on a long press of the icon', async ({
	request
}) => {
	const manifest = await (await request.get('/manifest.webmanifest')).json();
	expect(manifest.shortcuts.map((s: { name: string; url: string }) => [s.name, s.url])).toEqual([
		['Log training', '/?add=log'],
		['Record event', '/?add=event']
	]);
	for (const shortcut of manifest.shortcuts) {
		const icon = await request.get(shortcut.icons[0].src);
		expect(icon.headers()['content-type']).toBe('image/png');
	}
});

test('the shortcuts open Record event and Log training on Today, once', async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/?add=event');
	await expect(page.getByRole('dialog', { name: 'Record event' })).toBeVisible();
	await expect(page).toHaveURL('/');

	await page.reload();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
	await expect(page.getByRole('dialog', { name: 'Record event' })).toBeHidden();

	await page.goto('/?add=log');
	await expect(page.getByRole('dialog', { name: /exercise/i })).toBeVisible();
	await expect(page).toHaveURL('/');
});
