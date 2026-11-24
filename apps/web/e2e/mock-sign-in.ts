// Signing in through the mock OIDC provider's form (architecture §3.4). The real flow runs: our
// redirect, the provider's code, the token exchange and ID token validation, and our session.
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';

/** The session the phone projects start with, saved by `auth.setup.ts` (gitignored). */
export const SIGNED_IN = fileURLToPath(new URL('.auth/viewer.json', import.meta.url));

export interface TestPerson {
	subject: string;
	email: string;
	name: string;
	emailVerified?: boolean;
}

/** A person no other test or earlier run has used: the e2e database persists between runs. */
export function newPerson(label = 'sam'): TestPerson {
	const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	return { subject: `${label}-${id}`, email: `${label}+${id}@example.com`, name: `Test ${label}` };
}

/** The mock provider's origin (playwright.config.ts `OIDC_ISSUER`). */
export const MOCK_PROVIDER = 'http://localhost:8090';

/**
 * Fills in the mock provider's sign-in form, which the page must be on. Back at the app, someone
 * who hasn't accepted the terms is asked to (S19.1); `agree` accepts them as a person would, so
 * suites about other things land where the app sends them next. Without it, the page is left
 * wherever the sign-in ended.
 */
export async function signInAtMockProvider(
	page: Page,
	person: TestPerson,
	{ agree = true }: { agree?: boolean } = {}
): Promise<void> {
	await expect(page.getByRole('heading', { name: 'Mock OAuth2 Server Sign-in' })).toBeVisible();
	await page.getByPlaceholder('Enter any user/subject').fill(person.subject);
	await page.locator('textarea[name="claims"]').fill(
		JSON.stringify({
			email: person.email,
			email_verified: person.emailVerified ?? true,
			name: person.name
		})
	);
	await page.getByRole('button', { name: 'Sign-in' }).click();
	if (!agree) return;
	await page.waitForURL(
		(url) => url.origin !== MOCK_PROVIDER && !url.pathname.startsWith('/auth/')
	);
	if (new URL(page.url()).pathname === '/agree') await acceptTerms(page);
}

/** Ticks the age and terms box on the agree page and carries on (S19.1). */
export async function acceptTerms(page: Page): Promise<void> {
	await page.getByRole('checkbox', { name: /18 or older/ }).check();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.waitForURL((url) => url.pathname !== '/agree');
}

/** The time zone every household made through `createHousehold` keeps its clocks in. */
export const ZONE = 'Africa/Johannesburg';

/** A date on the test households' clocks, `days` from today: `0` is today, `-1` yesterday. */
export function dayFromToday(days: number): string {
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
	return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Headers for a JSON write through `page.request`: the app refuses a write without an Origin. */
export const jsonHeaders = (baseURL: string) => ({
	origin: baseURL,
	'content-type': 'application/json'
});

/**
 * Creates a household for whoever `page` is signed in as, through the API: most suites are about
 * what comes after onboarding, which has a suite of its own.
 */
export async function createHousehold(
	page: Page,
	baseURL: string,
	name = 'The Testers'
): Promise<void> {
	const response = await page.request.post('/api/v1/household', {
		headers: jsonHeaders(baseURL),
		data: JSON.stringify({ name, timeZone: ZONE })
	});
	expect(response.status()).toBe(201);
}

/**
 * Signs in as someone new from the sign-in page, accepting the terms unless `agree` is false,
 * landing wherever the app sends them.
 */
export async function signIn(
	page: Page,
	person: TestPerson,
	returnTo?: string,
	{ agree = true }: { agree?: boolean } = {}
): Promise<void> {
	const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
	await page.goto(`/sign-in${query}`);
	await page.getByRole('link', { name: 'Sign in' }).click();
	await signInAtMockProvider(page, person, { agree });
}

/** The mock's page loads a web font from Google; tests don't need it to reach the internet. */
export async function blockMockFonts(page: Page): Promise<void> {
	await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

/**
 * A JPEG like a phone camera's, landscape with location in its EXIF, in halves of two colours so
 * the framing shows. For `setInputFiles` or an API multipart.
 */
export async function photoFile(colours: [string, string] = ['#C98A4B', '#2E5EAA']) {
	const half = await sharp({
		create: { width: 600, height: 900, channels: 3, background: colours[1] }
	})
		.png()
		.toBuffer();
	const buffer = await sharp({
		create: { width: 1200, height: 900, channels: 3, background: colours[0] }
	})
		.composite([{ input: half, left: 600, top: 0 }])
		.jpeg()
		.withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 55/1 0/1' } })
		.toBuffer();
	return { name: 'dog.jpg', mimeType: 'image/jpeg', buffer };
}

export interface CreatedDog {
	id: string;
	name: string;
	etag: string;
	photo: { thumb: string; large: string };
}

/** Adds a dog to the household of whoever `page` is signed in as, through the API. */
export async function addDog(
	page: Page,
	baseURL: string,
	details: Record<string, unknown> = { name: 'Rosie' }
): Promise<CreatedDog> {
	const response = await page.request.post('/api/v1/dogs', {
		headers: { origin: baseURL },
		multipart: { dog: JSON.stringify(details), photo: await photoFile() }
	});
	expect(response.status()).toBe(201);
	return response.json();
}

/**
 * Signs `page` in as someone new who owns a new household with `dogs` (Rosie unless given),
 * returning the dogs in that order.
 */
export async function ownHousehold(
	page: Page,
	baseURL: string,
	{ dogs = ['Rosie'], name }: { dogs?: string[]; name?: string } = {}
): Promise<CreatedDog[]> {
	await signIn(page, newPerson('owner'));
	await createHousehold(page, baseURL, name);
	const added = [];
	for (const dog of dogs) added.push(await addDog(page, baseURL, { name: dog }));
	return added;
}
