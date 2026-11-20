import { describe, expect, it } from 'vitest';
import { securityTxt } from './security-txt.js';

describe('securityTxt', () => {
	const text = securityTxt({
		origin: 'https://toebeans.co.za',
		builtAt: new Date('2026-11-20T08:00:00Z')
	});

	it('gives the support address and the canonical URL on the app origin', () => {
		expect(text).toContain('Contact: mailto:support@toebeans.co.za\n');
		expect(text).toContain('Canonical: https://toebeans.co.za/.well-known/security.txt\n');
		expect(text).toContain('Preferred-Languages: en\n');
	});

	it('expires a year after the build, as RFC 9116 recommends at most', () => {
		expect(text).toContain('Expires: 2027-11-20T08:00:00.000Z\n');
	});

	it('is one field per line, ending in a newline', () => {
		expect(text.endsWith('\n')).toBe(true);
		for (const line of text.trimEnd().split('\n')) expect(line).toMatch(/^[A-Z][\w-]+: \S/);
	});
});
