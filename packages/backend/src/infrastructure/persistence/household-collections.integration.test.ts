import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import type { Viewer } from '../../application/auth/auth.js';
import { createInvitations } from '../../application/household/invitations.js';
import type { Household } from '../../domain/household.js';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { ok } from '../../domain/result.js';
import { hashSecretToken, newSecretToken } from '../../domain/secret-token.js';
import { manualClock } from '../../testing/clock.js';
import { fakeEmailSender } from '../../testing/household.js';
import { householdIsolationSuite } from '../../testing/household-isolation.js';
import { mongoUsers } from './auth-collections.js';
import {
	HOUSEHOLDS,
	INVITATIONS,
	mongoHouseholds,
	mongoInvitations
} from './household-collections.js';
import { migrate, migrations } from './migrations/index.js';
import { mongoUnitOfWork } from './unit-of-work.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-06T08:00:00Z');
const later = new Date('2026-11-13T08:00:00Z');
const clock = manualClock(at);
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const allowAll = { take: () => ({ allowed: true }) as const };

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const households = () => mongoHouseholds(db.mongo.db);
const invitations = () => mongoInvitations(db.mongo.db, clock);

const newHousehold = (owner: Id = ids.next()): Household => ({
	id: ids.next(),
	name: 'The Does',
	timeZone: 'Africa/Johannesburg',
	memberships: [{ userId: owner, role: 'owner', joinedAt: at }],
	version: 1,
	createdAt: at,
	updatedAt: at
});

const newInvitation = (householdId: Id, overrides = {}) => ({
	id: ids.next(),
	householdId,
	kind: 'link' as const,
	tokenHash: ids.next(),
	expiresAt: later,
	maxUses: 1,
	createdBy: ids.next(),
	...overrides
});

describe('mongoHouseholds', () => {
	it('finds a household by ID and by member', async () => {
		const household = newHousehold();
		expect(await households().insert(household)).toEqual(ok(undefined));
		expect(await households().find(household.id)).toEqual(household);
		expect(await households().findForMember(household.memberships[0]!.userId)).toEqual(household);
		expect(await households().findForMember(ids.next())).toBeNull();
	});

	it('adds a member, moving the version', async () => {
		const household = newHousehold();
		await households().insert(household);
		const member = { userId: ids.next(), role: 'caregiver' as const, joinedAt: later };
		expect(await households().addMember(household.id, member, later)).toEqual(ok(undefined));
		expect(await households().find(household.id)).toMatchObject({
			memberships: [household.memberships[0], member],
			version: 2,
			updatedAt: later
		});
		expect((await households().findForMember(member.userId))?.id).toBe(household.id);
	});

	it('keeps a person to one household, however they try (D16)', async () => {
		const owner = ids.next();
		const first = newHousehold(owner);
		await households().insert(first);
		const conflict = { ok: false, error: { kind: 'conflict' } };

		expect(await households().insert(newHousehold(owner))).toMatchObject(conflict);
		const other = newHousehold();
		await households().insert(other);
		const member = { userId: owner, role: 'caregiver' as const, joinedAt: at };
		expect(await households().addMember(other.id, member, at)).toMatchObject(conflict);
		// The unique index doesn't cover the same person twice in one document.
		expect(await households().addMember(first.id, member, at)).toMatchObject(conflict);
		expect((await households().find(first.id))!.memberships).toHaveLength(1);
	});

	it("doesn't quote the clashing value in its error", async () => {
		const owner = ids.next();
		await households().insert(newHousehold(owner));
		expect(JSON.stringify(await households().insert(newHousehold(owner)))).not.toContain(owner);
	});
});

describe('mongoInvitations', () => {
	it('stores what it was given and starts unused', async () => {
		const input = newInvitation(ids.next(), { kind: 'email', email: 'jane@example.com' });
		const stored = await invitations().insert(input);
		expect(stored).toEqual({ ...input, useCount: 0, version: 1, createdAt: at, updatedAt: at });
		expect(await invitations().findById(input.householdId, input.id)).toEqual(stored);
		expect(await invitations().findByTokenHash(input.tokenHash)).toEqual(stored);
		expect(await invitations().findByTokenHash('unknown')).toBeNull();
	});

	it('lists only what can still be used, newest first', async () => {
		const householdId = ids.next();
		const older = await invitations().insert(newInvitation(householdId));
		const newer = await invitations().insert(newInvitation(householdId));
		const expired = newInvitation(householdId, { expiresAt: at });
		await invitations().insert(expired);
		const used = await invitations().insert(newInvitation(householdId));
		await invitations().claim(householdId, used.id, at);
		const revoked = await invitations().insert(newInvitation(householdId));
		await invitations().revoke(householdId, revoked.id, 1, at);

		const open = await invitations().findOpen(householdId, at);
		expect(open.map((i) => i.id)).toEqual([newer.id, older.id]);
	});

	it('claims only while open', async () => {
		const householdId = ids.next();
		const { id } = await invitations().insert(newInvitation(householdId));
		expect(await invitations().claim(householdId, id, later)).toBe(false);
		expect(await invitations().claim(ids.next(), id, at)).toBe(false);
		expect(await invitations().claim(householdId, id, at)).toBe(true);
		expect(await invitations().claim(householdId, id, at)).toBe(false);
		expect(await invitations().findById(householdId, id)).toMatchObject({
			useCount: 1,
			version: 2
		});

		const revoked = await invitations().insert(newInvitation(householdId));
		await invitations().revoke(householdId, revoked.id, 1, at);
		expect(await invitations().claim(householdId, revoked.id, at)).toBe(false);
	});

	it('refuses a stale revoke', async () => {
		const householdId = ids.next();
		const { id } = await invitations().insert(newInvitation(householdId));
		expect(await invitations().revoke(householdId, id, 7, at)).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
	});

	it('has one invitation per token', async () => {
		const tokenHash = ids.next();
		await invitations().insert(newInvitation(ids.next(), { tokenHash }));
		await expect(
			invitations().insert(newInvitation(ids.next(), { tokenHash }))
		).rejects.toMatchObject({ code: 11000 });
	});

	it('clears invitations 30 days after they stop working', async () => {
		const indexes = await db.mongo.db.collection(INVITATIONS).indexes();
		expect(indexes.find((i) => i.expireAfterSeconds !== undefined)).toMatchObject({
			key: { expiresAt: 1 },
			expireAfterSeconds: 30 * 24 * 60 * 60
		});
	});
});

householdIsolationSuite('mongoInvitations', () => {
	const repo = invitations();
	return {
		create: async (householdId) => (await repo.insert(newInvitation(householdId))).id,
		read: (householdId, id) => repo.findById(householdId, id),
		list: async (householdId) => (await repo.findOpen(householdId, at)).map((i) => i.id),
		update: (householdId, id) => repo.revoke(householdId, id, 1, at),
		async remove(householdId, id) {
			await repo.remove(householdId, id);
			return { ok: false, error: { kind: 'not-found', resource: 'invitation' } };
		}
	};
});

describe('accepting, on a real transaction', () => {
	const service = () =>
		createInvitations(
			{
				invitations: invitations(),
				households: households(),
				users: mongoUsers(db.mongo.db),
				email: fakeEmailSender(),
				inviteEmailRateLimit: allowAll,
				uow: mongoUnitOfWork(db.mongo.client),
				clock,
				ids,
				logger: silent
			},
			{ publicOrigin: 'https://toebeans.example' }
		);
	const signedIn = (userId: Id = ids.next()): Viewer => ({
		auth: { userId },
		displayName: 'Alex',
		email: `${userId}@example.com`,
		member: null
	});

	async function invited() {
		const household = newHousehold();
		await households().insert(household);
		const secret = newSecretToken();
		const invitation = await invitations().insert(
			newInvitation(household.id, { tokenHash: hashSecretToken(secret) })
		);
		return { household, invitation, secret };
	}

	it('lets exactly one of two people take the last use', async () => {
		const { household, invitation, secret } = await invited();
		const results = await Promise.all([
			service().accept(secret, signedIn()),
			service().accept(secret, signedIn())
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.find((r) => !r.ok)).toMatchObject({ error: { kind: 'conflict' } });
		expect((await households().find(household.id))!.memberships).toHaveLength(2);
		expect((await invitations().findByTokenHash(invitation.tokenHash))!.useCount).toBe(1);
	});

	it("doesn't spend the invitation when the person can't join (rollback)", async () => {
		const { invitation, secret } = await invited();
		const elsewhere = newHousehold();
		await households().insert(elsewhere);
		// Their session predates joining the other household, so only the index can stop this.
		const stale = signedIn(elsewhere.memberships[0]!.userId);

		expect(await service().accept(secret, stale)).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
		expect((await invitations().findByTokenHash(invitation.tokenHash))!.useCount).toBe(0);
		expect(
			await db.mongo.db.collection(HOUSEHOLDS).countDocuments({ _id: elsewhere.id as never })
		).toBe(1);
	});
});

describe('leaving a household (D18)', () => {
	const owner = (userId: Id) => ({ userId, role: 'owner' as const, joinedAt: at });
	const written = { expectedVersion: 1, at };

	async function deactivated() {
		const by = ids.next();
		const household = newHousehold(by);
		await households().insert(household);
		expect((await households().deactivate(household.id, by, written)).ok).toBe(true);
		return { household, by };
	}

	it('holds any number of deactivated households, which the one-household index ignores', async () => {
		const first = await deactivated();
		const second = await deactivated();
		expect(await households().find(first.household.id)).toMatchObject({
			memberships: [],
			deactivated: { at, by: first.by },
			version: 2
		});
		expect((await households().findDeactivatedBy(second.by))?.id).toBe(second.household.id);
		expect(await households().findForMember(first.by)).toBeNull();
	});

	it('still holds a person to one household', async () => {
		const person = ids.next();
		await households().insert(newHousehold(person));
		expect((await households().insert(newHousehold(person))).ok).toBe(false);
	});

	it('finds the most recent one they left', async () => {
		const by = ids.next();
		const older = newHousehold(by);
		await households().insert(older);
		await households().deactivate(older.id, by, written);
		const newer = newHousehold(by);
		await households().insert(newer);
		await households().deactivate(newer.id, by, { expectedVersion: 1, at: later });
		expect((await households().findDeactivatedBy(by))?.id).toBe(newer.id);
	});

	it('brings one back, once, and frees it of its deactivated state', async () => {
		const { household, by } = await deactivated();
		expect((await households().reactivate(household.id, owner(by), later)).ok).toBe(true);
		const back = await households().find(household.id);
		expect(back).toMatchObject({ memberships: [owner(by)], version: 3 });
		expect(back?.deactivated).toBeUndefined();
		expect((await households().reactivate(household.id, owner(by), later)).ok).toBe(false);
	});

	it("won't bring one back for someone now in another", async () => {
		const { household, by } = await deactivated();
		await households().insert(newHousehold(by));
		expect((await households().reactivate(household.id, owner(by), later)).ok).toBe(false);
	});

	it("won't add a member to a deactivated household", async () => {
		const { household } = await deactivated();
		const added = await households().addMember(household.id, owner(ids.next()), later);
		expect(added.ok).toBe(false);
	});

	it('refuses a stale write', async () => {
		const household = newHousehold();
		await households().insert(household);
		const stale = { expectedVersion: 9, at };
		expect(await households().setMembers(household.id, [], stale)).toMatchObject({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect((await households().deactivate(household.id, ids.next(), stale)).ok).toBe(false);
	});

	it('revokes only open invitations, only in this household, only those asked for', async () => {
		const householdId = ids.next();
		const person = ids.next();
		const insert = (overrides = {}) => invitations().insert(newInvitation(householdId, overrides));
		const theirs = await insert({ createdBy: person });
		const toThem = await insert({ kind: 'email', email: 'them@example.com' });
		const another = await insert();
		const elsewhere = await invitations().insert(newInvitation(ids.next(), { createdBy: person }));

		const only = { createdBy: person, email: 'them@example.com' };
		await invitations().revokeOpen(householdId, at, only);
		const open = await invitations().findOpen(householdId, at);
		expect(open.map((i) => i.id)).toEqual([another.id]);
		expect((await invitations().findById(householdId, theirs.id))?.revokedAt).toEqual(at);
		expect((await invitations().findById(householdId, toThem.id))?.version).toBe(2);
		expect(await invitations().findOpen(elsewhere.householdId, at)).toHaveLength(1);

		await invitations().revokeOpen(householdId, at);
		expect(await invitations().findOpen(householdId, at)).toEqual([]);
	});
});
