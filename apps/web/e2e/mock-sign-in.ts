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

/** The mock's page loads a web font from Google; tests don't need it to reach the internet. */
export async function blockMockFonts(page: Page): Promise<void> {
	await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}
