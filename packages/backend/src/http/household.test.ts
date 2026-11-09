import { describe, expect, it, vi } from 'vitest';
import type { MemberViewer, Viewer } from '../application/auth/auth.js';
import type { Households } from '../application/household/household.js';
import type { Invitations } from '../application/household/invitations.js';
import type { RateLimiter } from '../application/ports/index.js';
import type { Id } from '../domain/id.js';
import { ok } from '../domain/result.js';
import { createHouseholdHttp } from './household.js';

const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };
const allowAll: RateLimiter = { take: () => ({ allowed: true }) };
const refuseAll: RateLimiter = { take: () => ({ allowed: false, retryAfterSeconds: 60 }) };
const client = { clientAddress: '203.0.113.7' };
const TOKEN = 'T'.repeat(43);

const outsider: Viewer = {
	auth: { userId: 'u' as Id },
	displayName: 'Sam',
	email: 'sam@example.com',
	member: null
};
const viewer: MemberViewer = {
	...outsider,
	member: {
		userId: 'u' as Id,
		householdId: 'h' as Id,
		role: 'owner',
		householdName: 'The Does',
		timeZone: 'UTC'
	}
};

const at = new Date('2026-11-06T08:00:00Z');
const invitationView = {
	invitation: {
		id: 'i' as Id,
		householdId: 'h' as Id,
		kind: 'link' as const,
		tokenHash: 'SECRET-HASH',
		expiresAt: at,
		maxUses: 1,
		useCount: 0,
		createdBy: 'u' as Id,
		version: 3,
		createdAt: at,
		updatedAt: at
	},
	invitedBy: 'Sam',
	canRevoke: true
};

function setup(rateLimit = allowAll) {
	const households = {
		view: vi.fn(async () =>
			ok({
				name: 'The Does',
				timeZone: 'UTC',
				version: 2,
				members: [{ displayName: 'Sam', role: 'owner' as const, joinedAt: at, you: true }]
			})
		),
		create: vi.fn()
	} as unknown as Households;
	const invitations = {
		createLink: vi.fn(async () => ({ ...invitationView, url: 'https://x.example/join/abc' })),
		createEmail: vi.fn(async () => ok(invitationView)),
		listOpen: vi.fn(async () => [invitationView]),
		revoke: vi.fn(async () => ok(undefined)),
		preview: vi.fn(async () => ok({ status: 'open' as const, signedIn: false })),
		accept: vi.fn(async () => ok(undefined))
	} as unknown as Invitations;
	const http = createHouseholdHttp(households, invitations, { rateLimit, logger: silent });
	return { http, households, invitations };
}

describe('household http', () => {
	it('gives the household with its ETag', async () => {
		const res = await setup().http.get(viewer);
		expect(res.status).toBe(200);
		expect(res.headers['etag']).toBe('"2"');
		expect(res.body).toMatchObject({
			name: 'The Does',
			members: [{ joinedAt: '2026-11-06T08:00:00.000Z' }]
		});
	});

	it('answers 404 to anything inside a household for someone without one', async () => {
		const { http, invitations } = setup();
		const answers = [
			await http.get(outsider),
			await http.listInvitations(outsider),
			await http.createInvitation(outsider, { body: { kind: 'link' } }),
			await http.revokeInvitation(outsider, { id: 'i', ifMatch: '"1"' })
		];
		expect(answers.map((a) => a.status)).toEqual([404, 404, 404, 404]);
		expect(invitations.createLink).not.toHaveBeenCalled();
	});

	it('shows the link once, at creation', async () => {
		const res = await setup().http.createInvitation(viewer, { body: { kind: 'link' } });
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({ url: 'https://x.example/join/abc', etag: '"3"' });
	});

	it('never puts the token hash in a response', async () => {
		const { http } = setup();
		const created = await http.createInvitation(viewer, { body: { kind: 'link' } });
		const listed = await http.listInvitations(viewer);
		expect(JSON.stringify([created.body, listed.body])).not.toContain('SECRET-HASH');
	});

	it('refuses a bad email address with a field error', async () => {
		const res = await setup().http.createInvitation(viewer, {
			body: { kind: 'email', email: 'not-an-address' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toMatchObject({ errors: { email: ['Enter a valid email address.'] } });
	});

	it("doesn't take a household ID from the body", async () => {
		const res = await setup().http.createInvitation(viewer, {
			body: { kind: 'link', householdId: 'someone-elses' }
		});
		expect(res.status).toBe(400);
	});

	it('needs If-Match to revoke', async () => {
		const { http, invitations } = setup();
		const res = await http.revokeInvitation(viewer, { id: 'i', ifMatch: null });
		expect(res.status).toBe(428);
		expect(invitations.revoke).not.toHaveBeenCalled();
		expect((await http.revokeInvitation(viewer, { id: 'i', ifMatch: '"3"' })).status).toBe(204);
		expect(invitations.revoke).toHaveBeenCalledWith(viewer.member, {
			id: 'i',
			expectedVersion: 3
		});
	});

	it('rate limits looking at and accepting invitations, per client address', async () => {
		const { http, invitations } = setup(refuseAll);
		const preview = await http.previewInvitation({ token: TOKEN, viewer: null, ...client });
		const accept = await http.acceptInvitation({ token: TOKEN, viewer: outsider, ...client });
		expect([preview.status, accept.status]).toEqual([429, 429]);
		expect(preview.body).toMatchObject({ type: 'toe-beans/rate-limited' });
		expect(invitations.preview).not.toHaveBeenCalled();
		expect(invitations.accept).not.toHaveBeenCalled();
	});
});
