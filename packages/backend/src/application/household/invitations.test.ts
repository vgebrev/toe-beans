import { describe, expect, it, vi } from 'vitest';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { INVITATION_TTL_MS } from '../../domain/invitation.js';
import { err, ok } from '../../domain/result.js';
import { hashSecretToken } from '../../domain/secret-token.js';
import type { User } from '../../domain/user.js';
import { directUnitOfWork, memoryUsers } from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { fakeEmailSender, memoryHouseholds, memoryInvitations } from '../../testing/household.js';
import type { MemberViewer, Viewer } from '../auth/auth.js';
import type { RateLimiter } from '../ports/index.js';
import { createInvitations } from './invitations.js';

const at = new Date('2026-11-06T08:00:00Z');
const ORIGIN = 'https://toebeans.example';
const person = (id: string, displayName: string): User => ({
	id: id as Id,
	identities: [],
	email: `${id}@example.com`,
	displayName,
	displayNameSource: 'user',
	version: 1,
	createdAt: at,
	updatedAt: at
});
const sam = person('sam', 'Sam');
const alex = person('alex', 'Alex');
const outsider = person('outsider', 'Olly');
const HOUSEHOLD = 'h1' as Id;
const OTHER_HOUSEHOLD = 'h2' as Id;

const silent = { debug() {}, info() {}, warn: vi.fn(), error() {}, child: () => silent };
const allowAll: RateLimiter = { take: () => ({ allowed: true }) };

const member = (
	user: User,
	role: 'owner' | 'caregiver' = 'owner',
	householdId = HOUSEHOLD
): MemberViewer => ({
	auth: { userId: user.id },
	displayName: user.displayName,
	email: user.email,
	member: {
		userId: user.id,
		householdId,
		role,
		householdName: 'The Does',
		timeZone: 'Africa/Johannesburg'
	}
});
const signedIn = (user: User): Viewer => ({ ...member(user), member: null });

async function setup({ inviteEmailRateLimit = allowAll } = {}) {
	const users = memoryUsers();
	for (const user of [sam, alex, outsider]) await users.insert(user);
	const households = memoryHouseholds();
	const newHousehold = (id: Id, owner: Id) => ({
		id,
		name: 'The Does',
		timeZone: 'Africa/Johannesburg',
		memberships: [{ userId: owner, role: 'owner' as const, joinedAt: at }],
		version: 1,
		createdAt: at,
		updatedAt: at
	});
	await households.insert(newHousehold(HOUSEHOLD, sam.id));
	await households.insert(newHousehold(OTHER_HOUSEHOLD, outsider.id));
	const invitations = memoryInvitations();
	const email = fakeEmailSender();
	const clock = manualClock(at);
	const service = createInvitations(
		{
			invitations,
			households,
			users,
			email,
			inviteEmailRateLimit,
			uow: directUnitOfWork,
			clock,
			ids: createIdGenerator(() => clock.now().getTime()),
			logger: silent
		},
		{ publicOrigin: ORIGIN }
	);
	return { service, invitations, households, email, clock };
}

const tokenOf = (url: string) => url.slice(`${ORIGIN}/join/`.length);

describe('invite links', () => {
	it('hands out the token once and keeps only its hash', async () => {
		const { service, invitations } = await setup();
		const { url, invitation } = await service.createLink(member(sam));
		const token = tokenOf(url);
		expect(token).toMatch(/^[\w-]{43}$/);
		const stored = invitations.all()[0]!;
		expect(stored.tokenHash).toBe(hashSecretToken(token));
		expect(JSON.stringify(stored)).not.toContain(token);
		expect(invitation).toMatchObject({
			kind: 'link',
			maxUses: 1,
			createdBy: sam.id,
			expiresAt: new Date(at.getTime() + INVITATION_TTL_MS)
		});
	});

	it('lets any member make one (FR-01)', async () => {
		const { service } = await setup();
		const { invitation } = await service.createLink(member(alex, 'caregiver'));
		expect(invitation.createdBy).toBe(alex.id);
	});
});

describe('email invitations', () => {
	it('sends the link to the normalised address and stores no token', async () => {
		const { service, email, invitations } = await setup();
		const result = await service.createEmail(member(sam), { email: ' Jane@Example.com ' });
		expect(result).toMatchObject({
			ok: true,
			value: { invitation: { email: 'jane@example.com' } }
		});
		expect(email.sent).toHaveLength(1);
		const message = email.sent[0]!;
		expect(message.to).toBe('jane@example.com');
		expect(message.subject).toBe('Sam invited you to The Does on Toe Beans');
		const token = /\/join\/([\w-]{43})/.exec(message.text)![1]!;
		expect(invitations.all()[0]!.tokenHash).toBe(hashSecretToken(token));
		expect(message.text).toContain('13 November 2026');
	});

	it("leaves nothing behind when the email can't be sent, and says so", async () => {
		const { service, email, invitations } = await setup();
		email.answer = err({ reason: 'resend 500' });
		expect(await service.createEmail(member(sam), { email: 'jane@example.com' })).toMatchObject({
			ok: false,
			error: { kind: 'unavailable' }
		});
		expect(invitations.all()).toEqual([]);
	});

	it('refuses someone already in the household', async () => {
		const { service, email } = await setup();
		expect(await service.createEmail(member(sam), { email: sam.email })).toMatchObject({
			ok: false,
			error: { kind: 'validation', fields: { email: [expect.any(String)] } }
		});
		expect(email.sent).toEqual([]);
	});

	it('limits how many a household can send', async () => {
		const take = vi.fn(() => ({ allowed: false, retryAfterSeconds: 60 }) as const);
		const { service, email } = await setup({ inviteEmailRateLimit: { take } });
		expect(await service.createEmail(member(sam), { email: 'jane@example.com' })).toEqual({
			ok: false,
			error: { kind: 'rate-limited' }
		});
		expect(take).toHaveBeenCalledWith(HOUSEHOLD);
		expect(email.sent).toEqual([]);
	});
});

describe('listing', () => {
	it('shows open invitations with who sent them, and only its own household', async () => {
		const { service } = await setup();
		const { invitation } = await service.createLink(member(sam));
		await service.createLink(member(outsider, 'owner', OTHER_HOUSEHOLD));
		const open = await service.listOpen(member(sam).member);
		expect(open.map((i) => i.invitation.id)).toEqual([invitation.id]);
		expect(open[0]).toMatchObject({ invitedBy: 'Sam', canRevoke: true });
	});

	it('leaves out expired, used and revoked ones', async () => {
		const { service, clock } = await setup();
		const ctx = member(sam).member;
		const revoked = await service.createLink(member(sam));
		await service.revoke(ctx, { id: revoked.invitation.id, expectedVersion: 1 });
		const used = await service.createLink(member(sam));
		await service.accept(tokenOf(used.url), signedIn(alex));
		await service.createLink(member(sam));
		clock.advance(INVITATION_TTL_MS);
		expect(await service.listOpen(ctx)).toEqual([]);
	});
});

describe('revoking', () => {
	const realId = 'not checked by the double';

	it('stops the link working', async () => {
		const { service } = await setup();
		const { invitation, url } = await service.createLink(member(sam));
		const ctx = member(sam).member;
		expect(await service.revoke(ctx, { id: invitation.id, expectedVersion: 1 })).toEqual(
			ok(undefined)
		);
		expect(await service.preview(tokenOf(url), null)).toEqual(
			ok({ status: 'revoked', signedIn: false })
		);
		expect(await service.accept(tokenOf(url), signedIn(alex))).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
	});

	it("lets a caregiver revoke their own invitation, but not someone else's", async () => {
		const { service } = await setup();
		const caregiver = member(alex, 'caregiver');
		const own = await service.createLink(caregiver);
		const owners = await service.createLink(member(sam));
		expect(
			await service.revoke(caregiver.member, { id: owners.invitation.id, expectedVersion: 1 })
		).toEqual({ ok: false, error: { kind: 'forbidden' } });
		expect(
			await service.revoke(caregiver.member, { id: own.invitation.id, expectedVersion: 1 })
		).toEqual(ok(undefined));
	});

	it('lets an owner revoke a caregiver invitation', async () => {
		const { service } = await setup();
		const { invitation } = await service.createLink(member(alex, 'caregiver'));
		expect(
			await service.revoke(member(sam).member, { id: invitation.id, expectedVersion: 1 })
		).toEqual(ok(undefined));
	});

	it('refuses a stale version (NFR-13)', async () => {
		const { service } = await setup();
		const { invitation } = await service.createLink(member(sam));
		expect(
			await service.revoke(member(sam).member, { id: invitation.id, expectedVersion: 9 })
		).toEqual({ ok: false, error: { kind: 'stale-version' } });
	});

	it("can't reach another household's invitation, even as its owner (scenario 9)", async () => {
		const { service } = await setup();
		const { invitation, url } = await service.createLink(member(sam));
		const theirs = member(outsider, 'owner', OTHER_HOUSEHOLD).member;
		expect(await service.revoke(theirs, { id: invitation.id, expectedVersion: 1 })).toEqual({
			ok: false,
			error: { kind: 'not-found', resource: 'invitation' }
		});
		expect(await service.preview(tokenOf(url), null)).toMatchObject({
			value: { status: 'open' }
		});
	});

	it('treats a malformed ID as not found', async () => {
		const { service } = await setup();
		expect(
			await service.revoke(member(sam).member, { id: realId, expectedVersion: 1 })
		).toMatchObject({ ok: false, error: { kind: 'not-found' } });
	});
});

describe('the join page preview', () => {
	it('names the household to anyone holding an open link', async () => {
		const { service } = await setup();
		const { url } = await service.createLink(member(sam));
		expect(await service.preview(tokenOf(url), null)).toEqual(
			ok({ status: 'open', signedIn: false, householdName: 'The Does' })
		);
		expect(await service.preview(tokenOf(url), signedIn(alex))).toEqual(
			ok({ status: 'open', signedIn: true, householdName: 'The Does' })
		);
	});

	it("doesn't find a token that was never issued, or isn't one", async () => {
		const { service } = await setup();
		for (const token of ['A'.repeat(43), 'short', '../etc/passwd']) {
			expect(await service.preview(token, null)).toEqual({
				ok: false,
				error: { kind: 'not-found', resource: 'invitation' }
			});
		}
	});

	it("doesn't name the household once the invitation is dead", async () => {
		const { service, clock } = await setup();
		const { url } = await service.createLink(member(sam));
		clock.advance(INVITATION_TTL_MS);
		expect(await service.preview(tokenOf(url), signedIn(alex))).toEqual(
			ok({ status: 'expired', signedIn: true })
		);
	});

	it('tells a member they already belong, even on a link that has since been used', async () => {
		const { service } = await setup();
		const { url } = await service.createLink(member(sam));
		await service.accept(tokenOf(url), signedIn(alex));
		expect(await service.preview(tokenOf(url), member(alex, 'caregiver'))).toMatchObject({
			value: { status: 'already-member' }
		});
	});

	it('says when the person is in another household', async () => {
		const { service } = await setup();
		const { url } = await service.createLink(member(sam));
		const viewer = member(outsider, 'owner', OTHER_HOUSEHOLD);
		expect(await service.preview(tokenOf(url), viewer)).toMatchObject({
			value: { status: 'in-another-household' }
		});
	});

	it('masks the address when an email invitation meets the wrong person', async () => {
		const { service, email } = await setup();
		await service.createEmail(member(sam), { email: 'jane@gmail.com' });
		const token = /\/join\/([\w-]{43})/.exec(email.sent[0]!.text)![1]!;
		expect(await service.preview(token, signedIn(alex))).toEqual(
			ok({
				status: 'email-mismatch',
				signedIn: true,
				householdName: 'The Does',
				emailHint: 'j•••@gmail.com'
			})
		);
		// Signed out there's nobody to mismatch, and the address isn't shown to any link holder.
		expect(await service.preview(token, null)).toEqual(
			ok({ status: 'open', signedIn: false, householdName: 'The Does' })
		);
	});
});

describe('accepting', () => {
	it('adds a caregiver to the household the invitation belongs to', async () => {
		const { service, households, invitations } = await setup();
		const { url } = await service.createLink(member(sam));
		expect(await service.accept(tokenOf(url), signedIn(alex))).toEqual(ok(undefined));
		const household = (await households.find(HOUSEHOLD))!;
		expect(household.memberships).toContainEqual({
			userId: alex.id,
			role: 'caregiver',
			joinedAt: at
		});
		expect(invitations.all()[0]!.useCount).toBe(1);
	});

	it('works once', async () => {
		const { service } = await setup();
		const { url } = await service.createLink(member(sam));
		await service.accept(tokenOf(url), signedIn(alex));
		const late = person('late', 'Late');
		expect(await service.accept(tokenOf(url), signedIn(late))).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
	});

	it('refuses an expired invitation', async () => {
		const { service, clock, households } = await setup();
		const { url } = await service.createLink(member(sam));
		clock.advance(INVITATION_TTL_MS);
		expect(await service.accept(tokenOf(url), signedIn(alex))).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
		expect((await households.find(HOUSEHOLD))!.memberships).toHaveLength(1);
	});

	it('needs the invited address for an email invitation (FR-01)', async () => {
		const { service, email, households } = await setup();
		await service.createEmail(member(sam), { email: alex.email });
		const token = /\/join\/([\w-]{43})/.exec(email.sent[0]!.text)![1]!;
		expect(await service.accept(token, signedIn(person('eve', 'Eve')))).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
		expect((await households.find(HOUSEHOLD))!.memberships).toHaveLength(1);
		expect(await service.accept(token, signedIn(alex))).toEqual(ok(undefined));
	});

	it('refuses someone in another household, leaving both as they were (D16)', async () => {
		const { service, households, invitations } = await setup();
		const { url } = await service.createLink(member(sam));
		const viewer = member(outsider, 'owner', OTHER_HOUSEHOLD);
		expect(await service.accept(tokenOf(url), viewer)).toMatchObject({
			ok: false,
			error: { kind: 'conflict' }
		});
		expect((await households.find(HOUSEHOLD))!.memberships).toHaveLength(1);
		expect(invitations.all()[0]!.useCount).toBe(0);
	});

	it("doesn't find a token that isn't one", async () => {
		const { service } = await setup();
		expect(await service.accept('nope', signedIn(alex))).toMatchObject({
			ok: false,
			error: { kind: 'not-found' }
		});
	});
});
