import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../application/account/account.js';
import type { Id } from '../domain/id.js';
import { err, ok } from '../domain/result.js';
import { createAccountHttp } from './account.js';
import { versionFromIfMatch } from './etag.js';

const ctx = { userId: 'u1' as Id };
const profile = { displayName: 'Sam', email: 'sam@example.com', version: 7 };

function fakeAccount(overrides: Partial<Account> = {}): Account {
	return {
		profile: vi.fn(async () => ok(profile)),
		rename: vi.fn(async (_ctx, { displayName }) => ok({ ...profile, displayName, version: 8 })),
		...overrides
	};
}

describe('versionFromIfMatch', () => {
	it('reads our ETags', () => {
		expect(versionFromIfMatch('"7"')).toEqual(ok(7));
		expect(versionFromIfMatch(' "12" ')).toEqual(ok(12));
	});

	it('needs the header', () => {
		expect(versionFromIfMatch(null)).toEqual(err({ kind: 'precondition-required' }));
		expect(versionFromIfMatch('')).toEqual(err({ kind: 'precondition-required' }));
	});

	it.each(['*', 'W/"7"', '"7", "8"', '7', '"0"', '"x"'])('treats %j as stale', (header) =>
		expect(versionFromIfMatch(header)).toEqual(err({ kind: 'stale-version' }))
	);
});

describe('account http', () => {
	it('GET sends the profile with its version as the ETag, never cached', async () => {
		expect(await createAccountHttp(fakeAccount()).get(ctx)).toEqual({
			status: 200,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store', etag: '"7"' },
			body: { displayName: 'Sam', email: 'sam@example.com' }
		});
	});

	it('PATCH renames at the If-Match version and sends the new ETag', async () => {
		const account = fakeAccount();
		const res = await createAccountHttp(account).update(ctx, {
			ifMatch: '"7"',
			body: { displayName: 'Sammy' }
		});
		expect(account.rename).toHaveBeenCalledWith(ctx, { displayName: 'Sammy', expectedVersion: 7 });
		expect(res).toMatchObject({
			status: 200,
			headers: { etag: '"8"' },
			body: { displayName: 'Sammy' }
		});
	});

	it('PATCH without If-Match is a 428 and changes nothing', async () => {
		const account = fakeAccount();
		const res = await createAccountHttp(account).update(ctx, {
			ifMatch: null,
			body: { displayName: 'Sammy' }
		});
		expect(res.status).toBe(428);
		expect(account.rename).not.toHaveBeenCalled();
	});

	it.each([undefined, { displayName: 3 }, { displayName: 'Sam', email: 'x@example.com' }])(
		'PATCH refuses the body %j with a 400',
		async (body) => {
			const res = await createAccountHttp(fakeAccount()).update(ctx, { ifMatch: '"7"', body });
			expect(res).toMatchObject({ status: 400, body: { type: 'toe-beans/validation' } });
		}
	);

	it('PATCH at a stale version is a 412 conflict', async () => {
		const account = fakeAccount({ rename: async () => err({ kind: 'stale-version' }) });
		const res = await createAccountHttp(account).update(ctx, {
			ifMatch: '"6"',
			body: { displayName: 'Sammy' }
		});
		expect(res).toMatchObject({ status: 412, body: { type: 'toe-beans/conflict' } });
	});
});
