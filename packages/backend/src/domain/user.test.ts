import { describe, expect, it } from 'vitest';
import { displayNameFor, normaliseEmail } from './user.js';

describe('normaliseEmail', () => {
	it('trims and lowercases, and folds nothing else', () => {
		expect(normaliseEmail('  Sam.Doe+dogs@Example.COM ')).toBe('sam.doe+dogs@example.com');
	});
});

describe('displayNameFor', () => {
	it("uses the provider's name", () => {
		expect(displayNameFor('  Sam Doe ', 'sam@example.com')).toBe('Sam Doe');
	});

	it('falls back to the email local part when there is no real name', () => {
		expect(displayNameFor(undefined, 'sam@example.com')).toBe('sam');
		expect(displayNameFor('', 'sam@example.com')).toBe('sam');
		// Auth0 uses the email as the name of email/password users.
		expect(displayNameFor('sam@example.com', 'sam@example.com')).toBe('sam');
	});
});
