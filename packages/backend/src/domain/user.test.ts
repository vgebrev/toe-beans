import { describe, expect, it } from 'vitest';
import { cleanDisplayName, displayNameFor, nameAfterSignIn, normaliseEmail } from './user.js';

describe('normaliseEmail', () => {
	it('trims and lowercases, and folds nothing else', () => {
		expect(normaliseEmail('  Sam.Doe+dogs@Example.COM ')).toBe('sam.doe+dogs@example.com');
	});
});

describe('displayNameFor', () => {
	it("uses the provider's name", () => {
		expect(displayNameFor('  Sam Doe ', 'sam@example.com')).toEqual({
			displayName: 'Sam Doe',
			displayNameSource: 'provider'
		});
	});

	it('falls back to the email local part when there is no real name', () => {
		const fallback = { displayName: 'sam', displayNameSource: 'email' };
		expect(displayNameFor(undefined, 'sam@example.com')).toEqual(fallback);
		expect(displayNameFor('', 'sam@example.com')).toEqual(fallback);
		// Auth0 uses the email as the name of email/password users.
		expect(displayNameFor('sam@example.com', 'sam@example.com')).toEqual(fallback);
	});
});

describe('nameAfterSignIn', () => {
	const fromEmail = { displayName: 'sam', displayNameSource: 'email' } as const;
	const fromGoogle = { displayName: 'Sam Doe', displayNameSource: 'provider' } as const;
	const chosen = { displayName: 'Sammy', displayNameSource: 'user' } as const;

	it("replaces a name from the email with a provider's real name", () => {
		expect(nameAfterSignIn(fromEmail, fromGoogle)).toEqual(fromGoogle);
	});

	it('keeps a real name, whichever method signs in', () => {
		expect(nameAfterSignIn(fromGoogle, fromEmail)).toEqual(fromGoogle);
		expect(nameAfterSignIn(fromGoogle, { ...fromGoogle, displayName: 'S. Doe' })).toEqual(
			fromGoogle
		);
	});

	it('never replaces a name the person chose', () => {
		expect(nameAfterSignIn(chosen, fromGoogle)).toEqual(chosen);
		expect(nameAfterSignIn(chosen, fromEmail)).toEqual(chosen);
	});
});

describe('cleanDisplayName', () => {
	it.each([
		['Sam', 'Sam'],
		['  Sam   Doe ', 'Sam Doe'],
		['Sam\tDoe', 'Sam Doe'],
		['Zoë', 'Zoë'],
		['Sam 👩‍👧', 'Sam 👩‍👧'],
		['a'.repeat(100), 'a'.repeat(100)]
	])('accepts %j as %j', (input, expected) => expect(cleanDisplayName(input)).toBe(expected));

	it.each(['', '   ', 'a'.repeat(101), 'Sam\u0000', 'Sam‮eoD'])('refuses %j', (input) =>
		expect(cleanDisplayName(input)).toBeNull()
	);
});
