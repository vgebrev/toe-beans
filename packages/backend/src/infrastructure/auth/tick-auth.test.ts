import { describe, expect, it } from 'vitest';
import { tickAuthenticator } from './tick-auth.js';

const secret = 'x'.repeat(40);

describe('tickAuthenticator', () => {
	it('takes the shared secret as a bearer token', async () => {
		const auth = tickAuthenticator({ secret });
		expect(await auth.verify(`Bearer ${secret}`)).toBe(true);
		expect(await auth.verify(`Bearer ${secret}y`)).toBe(false);
		expect(await auth.verify(secret)).toBe(false);
		expect(await auth.verify(null)).toBe(false);
	});

	it('refuses everyone when nothing is configured', async () => {
		expect(await tickAuthenticator({}).verify(`Bearer ${secret}`)).toBe(false);
	});

	it("refuses a token that isn't Google's", async () => {
		const auth = tickAuthenticator({
			google: { audience: 'https://toebeans.co.za/internal/tick', invoker: 'tick@example.com' }
		});
		expect(await auth.verify('Bearer not.a.jwt')).toBe(false);
	});
});
