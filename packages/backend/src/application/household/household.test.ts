import { describe, expect, it } from 'vitest';
import { createIdGenerator, type Id } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { directUnitOfWork, memoryUsers } from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { memoryHouseholds, memoryInvitations } from '../../testing/household.js';
import { createHouseholds } from './household.js';

const at = new Date('2026-11-06T08:00:00Z');
const sam: User = {
	id: 'u1' as Id,
	identities: [],
	email: 'sam@example.com',
	displayName: 'Sam',
	displayNameSource: 'user',
	version: 1,
	createdAt: at,
	updatedAt: at
};
const alex: User = { ...sam, id: 'u2' as Id, email: 'alex@example.com', displayName: 'Alex' };
const jo: User = { ...sam, id: 'u3' as Id, email: 'jo@example.com', displayName: 'Jo' };
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const valid = { name: ' The  Does ', timeZone: 'Africa/Johannesburg' };
const ctx = { userId: sam.id };

async function setup() {
	const users = memoryUsers();
	await users.insert(sam);
	await users.insert(alex);
	await users.insert(jo);
	const households = memoryHouseholds();
	const invitations = memoryInvitations();
	const clock = manualClock(at);
	const ids = createIdGenerator(() => clock.now().getTime());
	return {
		households,
		invitations,
		service: createHouseholds({
			households,
			invitations,
			users,
			uow: directUnitOfWork,
			clock,
			ids,
			logger: silent
		})
	};
}

describe('households', () => {
	it('makes the creator its owner', async () => {
		const { service, households } = await setup();
		expect(await service.create(ctx, valid)).toEqual({
			ok: true,
			value: {
				name: 'The Does',
				timeZone: 'Africa/Johannesburg',
				version: 1,
				members: [
					{
						id: sam.id,
						displayName: 'Sam',
						role: 'owner',
						joinedAt: at,
						you: true,
						canRemove: false
					}
				]
			}
		});
		expect(households.all()[0]!.memberships).toEqual([
			{ userId: sam.id, role: 'owner', joinedAt: at }
		]);
	});

	it('reports each bad field', async () => {
		const { service, households } = await setup();
		const result = await service.create(ctx, { name: ' ', timeZone: 'Mars/Olympus' });
		expect(result).toMatchObject({
			ok: false,
			error: {
				kind: 'validation',
				fields: { name: [expect.any(String)], timeZone: [expect.any(String)] }
			}
		});
		expect(households.all()).toEqual([]);
	});

	it('refuses a second household for the same person', async () => {
		const { service, households } = await setup();
		await service.create(ctx, valid);
		expect(await service.create(ctx, valid)).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
		expect(households.all()).toHaveLength(1);
	});

	it('shows the household to a member, and marks who is asking', async () => {
		const { service, households } = await setup();
		await service.create(ctx, valid);
		const householdId = households.all()[0]!.id;
		expect(await service.view({ userId: sam.id, householdId, role: 'owner' })).toMatchObject({
			ok: true,
			value: { name: 'The Does', members: [{ displayName: 'Sam', you: true }] }
		});
	});

	it('finds nothing for a household that is gone', async () => {
		const { service } = await setup();
		const gone = { userId: sam.id, householdId: 'gone' as Id, role: 'owner' as const };
		expect(await service.view(gone)).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'household' }
		});
	});
});

describe('people leaving a household (D18)', () => {
	const later = (days: number) => new Date(at.getTime() + days * 86_400_000);
	const HOUSEHOLD = 'h1' as Id;
	const asOwner = { userId: sam.id, householdId: HOUSEHOLD, role: 'owner' as const };
	const asCaregiver = (user: User) => ({
		userId: user.id,
		householdId: HOUSEHOLD,
		role: 'caregiver' as const
	});

	/** Sam owns it. Jo joined before Alex, though listed after, as order isn't what decides. */
	async function shared(...caregivers: User[]) {
		const context = await setup();
		await context.households.insert({
			id: HOUSEHOLD,
			name: 'The Does',
			timeZone: 'Africa/Johannesburg',
			memberships: [
				{ userId: sam.id, role: 'owner', joinedAt: at },
				...caregivers.map((user) => ({
					userId: user.id,
					role: 'caregiver' as const,
					joinedAt: later(user === jo ? 1 : 2)
				}))
			],
			version: 1,
			createdAt: at,
			updatedAt: at
		});
		const invite = (id: string, createdBy: Id, email?: string) =>
			context.invitations.insert({
				id: id as Id,
				householdId: HOUSEHOLD,
				kind: email ? 'email' : 'link',
				...(email && { email }),
				tokenHash: id,
				expiresAt: later(7),
				maxUses: 1,
				createdBy
			});
		const revoked = () =>
			context.invitations
				.all()
				.filter((i) => i.revokedAt)
				.map((i) => i.id);
		return { ...context, invite, revoked };
	}
	const household = (h: Awaited<ReturnType<typeof shared>>) => h.households.all()[0]!;

	it('passes ownership to whoever joined first when the owner leaves', async () => {
		const h = await shared(alex, jo);
		const left = await h.service.removeMember(asOwner, { memberId: sam.id, expectedVersion: 1 });
		expect(left.ok).toBe(true);
		expect(household(h).memberships.map((m) => [m.userId, m.role])).toEqual([
			[jo.id, 'owner'],
			[alex.id, 'caregiver']
		]);
		expect(household(h).version).toBe(2);
	});

	it('leaves the owner alone when a caregiver leaves, and keeps their invitations', async () => {
		const h = await shared(alex);
		await h.invite('i1', alex.id);
		const left = await h.service.removeMember(asCaregiver(alex), {
			memberId: alex.id,
			expectedVersion: 1
		});
		expect(left.ok).toBe(true);
		expect(household(h).memberships.map((m) => [m.userId, m.role])).toEqual([[sam.id, 'owner']]);
		expect(h.revoked()).toEqual([]);
	});

	it('deactivates the household when the last person leaves, and stops every invitation', async () => {
		const h = await shared();
		await h.invite('i1', sam.id);
		const left = await h.service.removeMember(asOwner, { memberId: sam.id, expectedVersion: 1 });
		expect(left.ok).toBe(true);
		expect(household(h)).toMatchObject({ memberships: [], deactivated: { at, by: sam.id } });
		expect(h.revoked()).toEqual(['i1']);
	});

	it('lets only the last person out bring it back, as its owner', async () => {
		const h = await shared(alex);
		await h.service.removeMember(asCaregiver(alex), { memberId: alex.id, expectedVersion: 1 });
		await h.service.removeMember(asOwner, { memberId: sam.id, expectedVersion: 2 });

		expect(await h.service.findReactivatable({ userId: alex.id })).toMatchObject({ ok: false });
		expect(await h.service.reactivate({ userId: alex.id })).toMatchObject({
			ok: false,
			error: { kind: 'not-found' }
		});

		expect(await h.service.findReactivatable({ userId: sam.id })).toEqual({
			ok: true,
			value: { name: 'The Does' }
		});
		const back = await h.service.reactivate({ userId: sam.id });
		expect(back).toMatchObject({ ok: true, value: { members: [{ role: 'owner', you: true }] } });
		expect(household(h).deactivated).toBeUndefined();
		expect(await h.service.findReactivatable({ userId: sam.id })).toMatchObject({ ok: false });
	});

	it("won't bring one back for someone who's since joined another", async () => {
		const h = await shared();
		await h.service.removeMember(asOwner, { memberId: sam.id, expectedVersion: 1 });
		await h.service.create({ userId: sam.id }, valid);
		expect(await h.service.reactivate({ userId: sam.id })).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
	});

	it('lets an owner remove someone, along with invitations that could bring them back', async () => {
		const h = await shared(alex, jo);
		await h.invite('theirs', alex.id);
		await h.invite('to-them', sam.id, alex.email);
		await h.invite('someone-elses', sam.id, 'friend@example.com');
		const removed = await h.service.removeMember(asOwner, {
			memberId: alex.id,
			expectedVersion: 1
		});
		expect(removed.ok).toBe(true);
		expect(household(h).memberships.map((m) => m.userId)).toEqual([sam.id, jo.id]);
		expect(h.revoked().sort()).toEqual(['theirs', 'to-them']);
	});

	it("doesn't let a caregiver remove anyone", async () => {
		const h = await shared(alex, jo);
		const removed = await h.service.removeMember(asCaregiver(alex), {
			memberId: jo.id,
			expectedVersion: 1
		});
		expect(removed).toMatchObject({ ok: false, error: { kind: 'forbidden' } });
		expect(household(h).memberships).toHaveLength(3);
	});

	it('finds nobody it was not asked about, and changes nothing on a stale version', async () => {
		const h = await shared(alex);
		expect(
			await h.service.removeMember(asOwner, { memberId: jo.id, expectedVersion: 1 })
		).toMatchObject({ ok: false, error: { kind: 'not-found' } });
		expect(
			await h.service.removeMember(asOwner, { memberId: alex.id, expectedVersion: 9 })
		).toMatchObject({ ok: false, error: { kind: 'stale-version' } });
		expect(household(h).memberships).toHaveLength(2);
	});

	it('shows an owner who they can remove, and nobody else', async () => {
		const h = await shared(alex);
		const flags = async (ctx: Parameters<typeof h.service.view>[0]) => {
			const view = await h.service.view(ctx);
			return view.ok ? view.value.members.map((m) => m.canRemove) : null;
		};
		expect(await flags(asOwner)).toEqual([false, true]);
		expect(await flags(asCaregiver(alex))).toEqual([false, false]);
	});
});
