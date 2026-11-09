import { describe, expect, it } from 'vitest';
import { hashSecretToken, isSecretToken, newSecretToken } from './secret-token.js';

describe('secret tokens', () => {
	it('are 256 random bits in base64url', () => {
		const a = newSecretToken();
		expect(isSecretToken(a)).toBe(true);
		expect(Buffer.from(a, 'base64url')).toHaveLength(32);
		expect(newSecretToken()).not.toBe(a);
	});

	it('hash to a stable SHA-256 that is not the token', () => {
		const token = newSecretToken();
		expect(hashSecretToken(token)).toBe(hashSecretToken(token));
		expect(hashSecretToken(token)).not.toBe(token);
		expect(hashSecretToken('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
	});

	it('reject anything else', () => {
		for (const value of ['', 'short', 'A'.repeat(44), `${'A'.repeat(42)}=`, `${'A'.repeat(42)}/`]) {
			expect(isSecretToken(value)).toBe(false);
		}
	});
});
