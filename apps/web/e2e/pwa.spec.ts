// The PWA around the pages (S13; NFR-03, NFR-04, NFR-09; ui.md §5.2, §6.1, §6.3): the
// connection and new-version banners, the fallback pages, saves while offline (scenario 8), the loading
// skeleton, installing and the home screen shortcuts. Each test brings its own household.
import { expect, test, type Page } from '@playwright/test';
import { ERROR_RELAY_PATH } from '@toe-beans/contracts';
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

const banner = (page: Page) =>
	page.getByText("Can't reach Toe Beans at the moment. Changes can't be saved right now.");

test('the connection banner shows while the phone is offline, and goes when it is back', async ({
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

test('a slow page shows the skeleton, then "Connecting to Toe Beans…" (NFR-09)', async ({
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
	await expect(page.getByText('Connecting to Toe Beans…')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');
	await expect(page.locator('[aria-busy="true"]')).toBeHidden();
});

test('a navigation stuck past 20 s offers Refresh, which loads the page it was going to', async ({
	page,
	context,
	baseURL
}) => {
	await page.clock.install();
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	// The first never answered, as a request lost on the way would be.
	let held = false;
	await context.route('**/api/v1/planned-sessions*', async (route) => {
		if (held) return route.continue();
		held = true;
	});

	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plan' }).click();
	await expect(page.getByText('Connecting to Toe Beans…')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Refresh' })).toBeHidden();
	await page.clock.fastForward(20_000);
	await expect(page.getByText('Toe Beans is taking longer than usual to connect…')).toBeVisible();

	// Reported once the page it loads has started error reporting (S17.11).
	const report = stuckReport(page);
	await page.getByRole('button', { name: 'Refresh' }).click();
	await expect(page).toHaveURL(/\/plan$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan');
	const body = await report;
	expect(body).toContain('A load was stuck past 20 s on the navigation');
	expect(body).toContain('"route":"/(app)/plan"');
});

/** The next report of a stuck load sent to the error relay (S17.11), as its envelope. */
const stuckReport = (page: Page) =>
	page
		.waitForRequest(
			(r) =>
				new URL(r.url()).pathname === ERROR_RELAY_PATH &&
				(r.postData() ?? '').includes('A load was stuck past 20 s'),
			{ timeout: 15_000 }
		)
		.then((r) => r.postData() ?? '');

test.describe('the waking page in place of a slow page load (S17.11)', () => {
	// Without the worker, so the page's own requests can be held; the first load of / gets the
	// waking page, as the worker gives it after a quiet spell.
	test.use({ serviceWorkers: 'block' });

	async function wakingOnFirstLoad(page: Page) {
		const waking = await page.request.get('/waking');
		let served = false;
		await page.route(
			(url) => url.pathname === '/',
			(route) => {
				if (served || route.request().resourceType() !== 'document') return route.continue();
				served = true;
				return route.fulfill({ response: waking });
			}
		);
	}

	test('it loads the page asked for once Toe Beans answers', async ({ page, baseURL }) => {
		await ownHousehold(page, baseURL!);
		await wakingOnFirstLoad(page);
		// The path that reaches the app on prod, unlike /healthz, which Cloud Run keeps.
		const checked = page.waitForRequest((r) => new URL(r.url()).pathname === '/readyz');
		await page.goto('/');
		await checked;
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
		await expect(page).toHaveURL('/');
	});

	test("offline, it reloads, for the worker's Can't reach Toe Beans page (S17.12)", async ({
		page,
		context,
		baseURL
	}) => {
		await ownHousehold(page, baseURL!);
		await wakingOnFirstLoad(page);
		// No answer, so the waking page keeps checking rather than loading the page.
		await page.route('**/readyz', (route) => route.abort());
		const checked = page.waitForRequest((r) => new URL(r.url()).pathname === '/readyz');
		await page.goto('/');
		await checked;
		await expect(page.locator('[aria-busy="true"]')).toBeVisible();
		// The worker (blocked here) answers the reload with *Can't reach Toe Beans*.
		const reload = page.waitForRequest(
			(r) => r.isNavigationRequest() && new URL(r.url()).pathname === '/'
		);
		await context.setOffline(true);
		await reload;
	});

	test('a check with no answer gives up after 10 s; stuck past 20 s, it is reported on the next start', async ({
		page,
		baseURL
	}) => {
		await page.clock.install();
		await ownHousehold(page, baseURL!);
		await wakingOnFirstLoad(page);
		// Held, as on a connection that died while the phone slept, until let through.
		let through = false;
		let checks = 0;
		await page.route('**/readyz', (route) => {
			checks++;
			if (through) return route.continue();
		});

		await page.goto('/');
		await expect(page.getByText('Connecting to Toe Beans…')).toBeVisible();
		expect(checks).toBe(1);
		// The stuck check gives up, and the next goes a second later.
		await page.clock.fastForward(10_000);
		await page.clock.fastForward(1_000);
		await expect.poll(() => checks).toBe(2);

		await page.clock.fastForward(10_000);
		await expect(page.getByText('Toe Beans is taking longer than usual to connect…')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();

		// Back: the next check gets through and the page loads by itself, then reports the wait.
		through = true;
		const report = stuckReport(page);
		await expect(async () => {
			await page.clock.fastForward(1_000);
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today', { timeout: 500 });
		}).toPass();
		const body = await report;
		expect(body).toContain('A load was stuck past 20 s on the waking page');
		expect(body).toContain('"lastCheck":"timed out"');
		expect(body).toContain('"worker":"none"');
	});
});

test("More shows the service worker's build next to the page's", async ({ page, baseURL }) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await waitForServiceWorker(page);
	await page.goto('/more');
	await expect(page.getByText(/^Version (\S+)\s+·\s+offline files \1$/)).toBeVisible();
});

test("with the service worker in place, a page load with no connection shows Can't reach Toe Beans", async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await waitForServiceWorker(page);

	await context.setOffline(true);
	await page.goto('/history');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("Can't reach Toe Beans");
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
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("Can't reach Toe Beans");
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

test("Try again on Can't reach Toe Beans loads the page once the connection is back", async ({
	page,
	context,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await waitForServiceWorker(page);
	await context.setOffline(true);
	await page.goto('/history');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("Can't reach Toe Beans");

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
	expect(cached).toEqual(expect.arrayContaining(['/unreachable', '/waking']));
	const fonts = cached.filter((path) => path.endsWith('.woff2'));
	expect(fonts.length).toBe(2);
	expect(fonts.every((path) => /-latin-wght-normal\./.test(path))).toBe(true);
	// Never anything with household data.
	expect(cached.some((path) => path.startsWith('/api/') || path === '/')).toBe(false);
});

test("the service worker's waking page is a skeleton that says it's connecting", async ({
	page
}) => {
	await page.goto('/waking');
	await expect(page.locator('[aria-busy="true"]')).toBeVisible();
	await expect(page.getByText('Connecting to Toe Beans…')).toBeVisible();
});

test("the waking page opened as itself stops pulsing once it says it can't connect (S17.12)", async ({
	page,
	context
}) => {
	await page.goto('/waking');
	await expect(page.locator('[class*="animate-pulse"]').first()).toBeVisible();
	await context.setOffline(true);
	await expect(page.getByText("Can't reach Toe Beans at the moment.")).toBeVisible();
	await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0);
	await context.setOffline(false);
});

test('the waking page, past 20 s, says it is taking longer than usual and offers Refresh', async ({
	page
}) => {
	await page.clock.install();
	await page.goto('/waking');
	await expect(page.getByText('Connecting to Toe Beans…')).toBeVisible();
	await page.clock.fastForward(20_000);
	await expect(page.getByText('Toe Beans is taking longer than usual to connect…')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
});

test("a page still on the build before a deploy gets that build's files from its cache (S17.2)", async ({
	page,
	baseURL
}) => {
	await ownHousehold(page, baseURL!);
	await page.goto('/');
	await waitForServiceWorker(page);
	// The previous build's cache, as the new worker keeps it: the server no longer has its files.
	const path = '/_app/immutable/chunks/from-the-old-build.js';
	await page.evaluate(async (path) => {
		const cache = await caches.open('toe-beans-the-build-before');
		await cache.put(
			path,
			new Response('export const old = true;', {
				headers: { 'content-type': 'text/javascript' }
			})
		);
	}, path);

	const answer = await page.evaluate(async (path) => {
		const response = await fetch(path);
		return { status: response.status, body: await response.text() };
	}, path);
	expect(answer).toEqual({ status: 200, body: 'export const old = true;' });
	// Anything else not precached still goes to the server.
	const missing = await page.evaluate(
		async () => (await fetch('/_app/immutable/chunks/no-build-had-this.js')).status
	);
	expect(missing).toBe(404);
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

test('off prod the app installs as Toe Beans (Test), with the TEST icons (S17.6)', async ({
	page,
	request
}) => {
	const response = await request.get('/manifest.webmanifest');
	expect(response.headers()['content-type']).toBe('application/manifest+json');
	const manifest = await response.json();
	expect(manifest.name).toBe('Toe Beans (Test)');
	for (const icon of manifest.icons) {
		expect(icon.src).toMatch(/^\/icons\/test-/);
		expect((await request.get(icon.src)).headers()['content-type']).toBe('image/png');
	}
	// The page links it, and Chrome reads it from there.
	await page.goto('/sign-in');
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
		'href',
		'/manifest.webmanifest'
	);
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
