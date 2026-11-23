import { describe, expect, it } from 'vitest';
import type { Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import type { PlainTime } from '../../domain/calendar.js';
import type { Household } from '../../domain/household.js';
import {
	directUnitOfWork,
	fakeIdentityAccounts,
	memorySessions,
	memoryUsers
} from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { memoryPhotoStore } from '../../testing/dogs.js';
import {
	memoryHouseholdData,
	memoryHouseholds,
	memoryInvitations
} from '../../testing/household.js';
import { silentLogger } from '../../testing/logger.js';
import {
	memoryPushDevices,
	memoryReminderPreferences,
	memoryReminders
} from '../../testing/reminders.js';
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

async function setup(user: User = sam) {
	const users = memoryUsers();
	await users.insert(user);
	const clock = manualClock(at);
	const now = () => clock.now();
	const households = memoryHouseholds();
	const ports = {
		users,
		sessions: memorySessions(),
		identityAccounts: fakeIdentityAccounts(),
		households,
		householdData: memoryHouseholdData(households),
		invitations: memoryInvitations(now),
		photos: memoryPhotoStore(),
		pushDevices: memoryPushDevices(now),
		reminderPreferences: memoryReminderPreferences(),
		reminders: memoryReminders(now),
		uow: directUnitOfWork,
		clock,
		logger: silentLogger,
		errors: { capture() {}, flush: async () => {} }
	};
	return { ...ports, account: createAccount(ports) };
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

describe('accepting the terms (S19.1)', () => {
	const ctx = { userId: sam.id };
	const current = '2026-11-19';

	it('records the version and when', async () => {
		const { account, users, clock } = await setup();
		clock.advance(1000);
		expect(await account.acceptTerms(ctx, { version: current, current })).toEqual({
			ok: true,
			value: undefined
		});
		expect(users.all()[0]).toMatchObject({
			termsAccepted: { version: current, at: clock.now() },
			version: 5
		});
	});

	it('refuses terms other than those in force, so what was agreed is what applies', async () => {
		const { account, users } = await setup();
		expect(await account.acceptTerms(ctx, { version: '2026-10-01', current })).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
		expect(users.all()[0]!.termsAccepted).toBeUndefined();
	});

	it('refuses a version that is not a date', async () => {
		const { account } = await setup();
		expect(await account.acceptTerms(ctx, { version: 'latest', current })).toMatchObject({
			ok: false,
			error: { kind: 'validation' }
		});
	});

	it("doesn't find a deleted user", async () => {
		const { account } = await setup({ ...sam, deletedAt: at });
		expect(await account.acceptTerms(ctx, { version: current, current })).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'account' }
		});
	});
});

describe('deleting an account (S16.5, D38)', () => {
	const ctx = { userId: sam.id };
	const alex: User = { ...sam, id: 'u2' as Id, email: 'alex@example.com', displayName: 'Alex' };
	const google = { issuer: 'https://idp.example/', subject: 'google-oauth2|1', linkedAt: at };
	const household = (id: string, members: User[], extra: Partial<Household> = {}): Household => ({
		id: id as Id,
		name: id,
		timeZone: 'Africa/Johannesburg',
		memberships: members.map((u, i) => ({
			userId: u.id,
			role: i === 0 ? 'owner' : 'caregiver',
			joinedAt: at
		})),
		version: 1,
		createdAt: at,
		updatedAt: at,
		...extra
	});

	/** Sam, with a device, settings, a reminder and a session; Alex's and another household's too. */
	async function withData(samsHousehold: User[]) {
		const context = await setup({ ...sam, identities: [google] });
		await context.users.insert(alex);
		await context.households.insert(household('h1', samsHousehold));
		await context.households.insert(
			household('old', [], { deactivated: { at: new Date('2026-01-01T00:00:00Z'), by: sam.id } })
		);
		await context.households.insert(household('h2', [{ ...alex, id: 'u9' as Id }]));
		for (const key of ['households/h1/a.webp', 'households/old/b.webp', 'households/h2/c.webp']) {
			await context.photos.put(key, new Uint8Array(1), 'image/webp');
		}
		for (const user of [sam, alex]) {
			const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
			await context.pushDevices.save({
				id: `d-${user.id}` as Id,
				userId: user.id,
				endpoint: `https://fcm.googleapis.com/fcm/send/${user.id}`,
				keys,
				label: 'Phone'
			});
			await context.reminderPreferences.save({
				userId: user.id,
				training: true,
				trainingLeadMin: 0,
				care: true,
				careLeadDays: 0,
				careTimeOfDay: '08:00' as PlainTime
			});
			await context.reminders.insert({
				id: `r-${user.id}` as Id,
				key: `test:${user.id}`,
				kind: 'test',
				householdId: 'h1' as Id,
				userId: user.id,
				dueAt: at,
				status: 'pending',
				attempts: 0,
				delivered: []
			});
			await context.sessions.insert({
				tokenHash: `t-${user.id}`,
				userId: user.id,
				createdAt: at,
				expiresAt: new Date('2027-01-01'),
				absoluteExpiresAt: new Date('2027-01-01'),
				extendedAt: at
			});
		}
		return context;
	}

	it('deletes their own data, leaves a shared household and hands it on (D18)', async () => {
		const h = await withData([sam, alex]);
		const invite = (id: string, createdBy: Id) =>
			h.invitations.insert({
				id: id as Id,
				householdId: 'h1' as Id,
				kind: 'link',
				tokenHash: id,
				expiresAt: new Date('2026-12-01'),
				maxUses: 1,
				createdBy
			});
		await invite('theirs', sam.id);
		await invite('alexs', alex.id);
		expect(await h.account.delete(ctx)).toEqual({ ok: true, value: undefined });

		expect(h.identityAccounts.deleted).toEqual([google]);
		expect(h.users.all().map((u) => u.id)).toEqual([alex.id]);
		expect(h.sessions.all().map((s) => s.userId)).toEqual([alex.id]);
		expect(h.pushDevices.all().map((d) => d.userId)).toEqual([alex.id]);
		expect(await h.reminderPreferences.find(sam.id)).toBeNull();
		expect(await h.reminderPreferences.find(alex.id)).not.toBeNull();
		expect(h.reminders.all().map((r) => r.userId)).toEqual([alex.id]);

		const shared = (await h.households.find('h1' as Id))!;
		expect(shared.memberships.map((m) => [m.userId, m.role])).toEqual([[alex.id, 'owner']]);
		// Signed up again, they could come back with their own links; the others' stay.
		expect(h.invitations.all().map((i) => [i.id, i.revokedAt])).toEqual([
			['theirs', at],
			['alexs', undefined]
		]);
		// The household they left stays, photos and all; the one only they could bring back goes.
		expect(h.householdData.erased).toEqual(['old']);
		expect(h.photos.keys()).toEqual(['households/h1/a.webp', 'households/h2/c.webp']);
	});

	it('deletes the household too when nobody else is in it', async () => {
		const h = await withData([sam]);
		await h.invitations.insert({
			id: 'i1' as Id,
			householdId: 'h1' as Id,
			kind: 'link',
			tokenHash: 'i1',
			expiresAt: new Date('2026-12-01'),
			maxUses: 1,
			createdBy: sam.id
		});
		expect(await h.account.delete(ctx)).toEqual({ ok: true, value: undefined });
		expect(h.householdData.erased.sort()).toEqual(['h1', 'old']);
		expect(h.households.all().map((x) => x.id)).toEqual(['h2']);
		expect(h.photos.keys()).toEqual(['households/h2/c.webp']);
		expect(h.invitations.all()[0]!.revokedAt).toEqual(at);
	});

	it("deletes nothing if the provider can't be reached, so they can try again", async () => {
		const h = await withData([sam]);
		h.identityAccounts.failing = true;
		expect(await h.account.delete(ctx)).toMatchObject({
			ok: false,
			error: { kind: 'unavailable' }
		});
		expect(h.users.all()).toHaveLength(2);
		expect(h.householdData.erased).toEqual([]);
		expect(h.photos.keys()).toHaveLength(3);
		expect(h.sessions.all()).toHaveLength(2);

		h.identityAccounts.failing = false;
		expect(await h.account.delete(ctx)).toMatchObject({ ok: true });
		expect(h.users.all().map((u) => u.id)).toEqual([alex.id]);
	});

	it('finds no account that is already gone', async () => {
		const h = await setup();
		expect(await h.account.delete({ userId: 'nobody' as Id })).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'account' }
		});
	});
});
