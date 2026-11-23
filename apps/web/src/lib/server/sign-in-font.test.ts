import { describe, expect, it } from 'vitest';
import { signInFontHeaders } from './sign-in-font.js';

describe('signInFontHeaders', () => {
	it("lets only the issuer's origin load the font", () => {
		const headers = signInFontHeaders('https://auth.toebeans.co.za/');
		expect(headers['access-control-allow-origin']).toBe('https://auth.toebeans.co.za');
	});

	it('takes the origin of an issuer with a path, as the mock provider has', () => {
		const headers = signInFontHeaders('http://localhost:8090/default');
		expect(headers['access-control-allow-origin']).toBe('http://localhost:8090');
	});

	it('is a woff2 cached for a day, not forever, since the file under the address can change', () => {
		expect(signInFontHeaders('https://auth.toebeans.co.za/')).toMatchObject({
			'content-type': 'font/woff2',
			'cache-control': 'public, max-age=86400'
		});
	});
});
