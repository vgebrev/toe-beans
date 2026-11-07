// Signing in through the mock OIDC provider's form (architecture §3.4). The real flow runs: our
// redirect, the provider's code, the token exchange and ID token validation, and our session.
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

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

/** Fills in the mock provider's sign-in form, which the page must be on. */
export async function signInAtMockProvider(page: Page, person: TestPerson): Promise<void> {
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
}

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
		headers: { origin: baseURL, 'content-type': 'application/json' },
		data: JSON.stringify({ name, timeZone: 'Africa/Johannesburg' })
	});
	expect(response.status()).toBe(201);
}

/** Signs in as someone new from the sign-in page, landing wherever the app sends them. */
export async function signIn(page: Page, person: TestPerson, returnTo?: string): Promise<void> {
	const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
	await page.goto(`/sign-in${query}`);
	await page.getByRole('link', { name: 'Sign in' }).click();
	await signInAtMockProvider(page, person);
}

/** The mock's page loads a web font from Google; tests don't need it to reach the internet. */
export async function blockMockFonts(page: Page): Promise<void> {
	await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}
