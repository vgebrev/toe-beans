import { describe, expect, it } from 'vitest';
import type { Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { memoryUsers } from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { createAccount } from './account.js';

const at = new Date('2026-11-04T08:00:00Z');
const sam: User = {
	id: 'u1' as Id,
	identities: [],
	email: 'sam@example.com',
	displayName: 'sam',
	displayNameSource: 'email',
	version: 4,
	createdAt: at,
	updatedAt: at
};
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };

async function setup(user: User = sam) {
	const users = memoryUsers();
	await users.insert(user);
	const clock = manualClock(at);
	return { users, clock, account: createAccount({ users, clock, logger: silent }) };
}

describe('account', () => {
	const ctx = { userId: sam.id };

	it('gives the profile with its version', async () => {
		const { account } = await setup();
		expect(await account.profile(ctx)).toEqual({
			ok: true,
			value: { displayName: 'sam', email: 'sam@example.com', version: 4 }
		});
	});

	it("doesn't find a deleted or unknown user", async () => {
		const { account } = await setup({ ...sam, deletedAt: at });
		const missing = { ok: false, error: { kind: 'not-found', resource: 'account' } };
		expect(await account.profile(ctx)).toEqual(missing);
		expect(await account.profile({ userId: 'nobody' as Id })).toEqual(missing);
	});

	it('renames, tidying the whitespace, and marks the name as chosen', async () => {
		const { account, users, clock } = await setup();
		clock.advance(1000);
		expect(await account.rename(ctx, { displayName: '  Sam   Doe ', expectedVersion: 4 })).toEqual({
			ok: true,
			value: { displayName: 'Sam Doe', email: 'sam@example.com', version: 5 }
		});
		expect(users.all()[0]).toMatchObject({
			displayName: 'Sam Doe',
			displayNameSource: 'user',
			updatedAt: clock.now()
		});
	});

	it('refuses a blank or overlong name with a field error', async () => {
		const { account } = await setup();
		for (const displayName of ['   ', 'a'.repeat(101)]) {
			expect(await account.rename(ctx, { displayName, expectedVersion: 4 })).toMatchObject({
				ok: false,
				error: { kind: 'validation', fields: { displayName: [expect.any(String)] } }
			});
		}
	});

	it('refuses a stale version without changing anything (NFR-13)', async () => {
		const { account, users } = await setup();
		expect(await account.rename(ctx, { displayName: 'Sammy', expectedVersion: 3 })).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect(users.all()[0]!.displayName).toBe('sam');
	});
});
