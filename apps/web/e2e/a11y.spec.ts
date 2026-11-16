// Accessibility checks that can run unattended (S13.4; ui.md §7): at 200% text size, as
// Android's font size setting gives an installed app (app.html's `text-scale` meta scales the
// root font), no page scrolls sideways. TalkBack is tried by hand on a phone.
import { expect, test, type Page } from '@playwright/test';
import { addDog, blockMockFonts, createHousehold, newPerson, signIn } from './mock-sign-in.js';
import { fakePushInBrowser, fakeSubscription } from './push-service.js';

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(({ page }) => blockMockFonts(page));

const pages = [
	'/',
	'/plan',
	'/history',
	'/care',
	'/more',
	'/library',
	'/cues',
	'/dogs',
	'/household',
	'/settings/notifications',
	'/plan/new',
	'/care/new'
];

async function at200Percent(page: Page) {
	await page.addInitScript(() => {
		document.addEventListener('DOMContentLoaded', () => {
			document.documentElement.style.fontSize = '200%';
		});
	});
}

test('at 200% text size, no page scrolls sideways', async ({ page, baseURL }) => {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL!);
	await addDog(page, baseURL!, { name: 'Rosie' });
	await at200Percent(page);

	const wide: string[] = [];
	for (const path of pages) {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		if (overflow > 0) wide.push(`${path} (${overflow} px)`);
	}
	expect(wide).toEqual([]);
});

const ZONE = 'Africa/Johannesburg';
const json = (baseURL: string) => ({ origin: baseURL, 'content-type': 'application/json' });
const dayFromToday = (days: number) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(
		new Date(Date.now() + days * 86_400_000)
	);

test("at 200% text size, Today's cards keep their titles wide, beside Log and Overdue", async ({
	page,
	baseURL
}) => {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL!);
	const dog = await addDog(page, baseURL!, { name: 'Rosie' });
	for (const [path, body] of [
		[
			'/api/v1/planned-sessions',
			{ dogId: dog.id, exerciseId: 'recall-basics', date: dayFromToday(0), times: ['00:00'] }
		],
		['/api/v1/care-tasks', { dogId: dog.id, category: 'vaccination', dueDate: dayFromToday(-2) }]
	] as const) {
		const response = await page.request.post(path, {
			headers: json(baseURL!),
			data: JSON.stringify(body)
		});
		expect(response.status()).toBe(201);
	}
	await at200Percent(page);
	await page.goto('/');

	const session = page.getByRole('link', { name: /Recall basics/ });
	const care = page.getByRole('link', { name: /Vaccination/ });
	await expect(care).toContainText('Overdue');
	const log = page.getByRole('button', { name: /^Log Recall basics/ });
	await expect(log).toBeVisible();

	// Each title has most of its card's width: the labels and Log moved out of its way.
	for (const [card, title] of [
		[session, session.getByText('Recall basics', { exact: true })],
		[care, care.getByText('Vaccination', { exact: true })]
	] as const) {
		const cardBox = (await card.boundingBox())!;
		const titleBox = (await title.boundingBox())!;
		expect(titleBox.width).toBeGreaterThan(cardBox.width * 0.5);
	}
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('at 200% text size, Notifications with reminders on fits across', async ({
	page,
	baseURL
}) => {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL!);
	await fakePushInBrowser(page, fakeSubscription());
	await at200Percent(page);
	await page.goto('/settings/notifications');
	await page.getByRole('switch', { name: /Push notifications/ }).click();
	await expect(page.getByLabel('Care reminder time')).toBeVisible();

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	const time = (await page.getByLabel('Care reminder time').boundingBox())!;
	expect(time.x + time.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
