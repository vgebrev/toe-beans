// In-memory doubles for the household ports, for unit tests of the use cases. The Mongo adapters
// have their own integration tests.
import type {
	EmailMessage,
	EmailSender,
	HouseholdRepository,
	InvitationRepository
} from '../application/ports/index.js';
import { conflictError, notFound, staleVersion } from '../application/errors.js';
import type { Household } from '../domain/household.js';
import { invitationState, type Invitation } from '../domain/invitation.js';
import { err, ok, type Result } from '../domain/result.js';

export function memoryHouseholds(): HouseholdRepository & { all(): Household[] } {
	const households = new Map<string, Household>();
	const hasMember = (h: Household, userId: string) =>
		h.memberships.some((m) => m.userId === userId);
	const inOne = (userId: string) => [...households.values()].some((h) => hasMember(h, userId));
	const conflict = conflictError('This person already belongs to a household.');
	return {
		all: () => structuredClone([...households.values()]),
		async insert(household) {
			if (household.memberships.some((m) => inOne(m.userId))) return err(conflict);
			households.set(household.id, structuredClone(household));
			return ok(undefined);
		},
		find: async (id) => structuredClone(households.get(id) ?? null),
		findForMember: async (userId) =>
			structuredClone([...households.values()].find((h) => hasMember(h, userId)) ?? null),
		findDeactivatedBy: async (userId) =>
			structuredClone(
				[...households.values()]
					.filter((h) => h.deactivated?.by === userId)
					.sort((a, b) => b.deactivated!.at.getTime() - a.deactivated!.at.getTime())[0] ?? null
			),
		async addMember(id, membership, at) {
			const h = households.get(id)!;
			if (inOne(membership.userId) || h.deactivated) return err(conflict);
			h.memberships.push(structuredClone(membership));
			Object.assign(h, { updatedAt: at, version: h.version + 1 });
			return ok(undefined);
		},
		async setMembers(id, memberships, { expectedVersion, at }) {
			const h = households.get(id)!;
			if (h.version !== expectedVersion) return err(staleVersion);
			Object.assign(h, {
				memberships: structuredClone(memberships),
				updatedAt: at,
				version: h.version + 1
			});
			return ok(undefined);
		},
		async deactivate(id, by, { expectedVersion, at }) {
			const h = households.get(id)!;
			if (h.version !== expectedVersion) return err(staleVersion);
			Object.assign(h, {
				memberships: [],
				deactivated: { at, by },
				updatedAt: at,
				version: h.version + 1
			});
			return ok(undefined);
		},
		async reactivate(id, owner, at) {
			const h = households.get(id)!;
			if (!h.deactivated || inOne(owner.userId)) return err(conflict);
			delete h.deactivated;
			Object.assign(h, {
				memberships: [structuredClone(owner)],
				updatedAt: at,
				version: h.version + 1
			});
			return ok(undefined);
		}
	};
}

export function memoryInvitations(): InvitationRepository & { all(): Invitation[] } {
	const invitations = new Map<string, Invitation>();
	const inHousehold = (householdId: string, id: string) => {
		const i = invitations.get(id);
		return i?.householdId === householdId ? i : undefined;
	};
	return {
		all: () => structuredClone([...invitations.values()]),
		async insert(invitation) {
			const at = new Date();
			const stored = { ...invitation, useCount: 0, version: 1, createdAt: at, updatedAt: at };
			invitations.set(invitation.id, structuredClone(stored));
			return structuredClone(stored);
		},
		findById: async (householdId, id) => structuredClone(inHousehold(householdId, id) ?? null),
		findOpen: async (householdId, now) =>
			structuredClone(
				[...invitations.values()]
					.filter((i) => i.householdId === householdId && invitationState(i, now) === 'open')
					.reverse()
			),
		findByTokenHash: async (tokenHash) =>
			structuredClone([...invitations.values()].find((i) => i.tokenHash === tokenHash) ?? null),
		async claim(householdId, id, now) {
			const i = inHousehold(householdId, id);
			if (!i || invitationState(i, now) !== 'open') return false;
			i.useCount++;
			i.version++;
			return true;
		},
		async revoke(householdId, id, expectedVersion, at) {
			const i = inHousehold(householdId, id);
			if (!i) return err(notFound('invitation'));
			if (i.version !== expectedVersion) return err(staleVersion);
			Object.assign(i, { revokedAt: at, updatedAt: at, version: i.version + 1 });
			return ok(structuredClone(i));
		},
		async revokeOpen(householdId, at, only) {
			for (const i of invitations.values()) {
				if (i.householdId !== householdId || invitationState(i, at) !== 'open') continue;
				if (only && i.createdBy !== only.createdBy && i.email !== only.email) continue;
				Object.assign(i, { revokedAt: at, updatedAt: at, version: i.version + 1 });
			}
		},
		async remove(householdId, id) {
			if (inHousehold(householdId, id)) invitations.delete(id);
		}
	};
}

export interface FakeEmailSender extends EmailSender {
	sent: EmailMessage[];
	/** What the next `send` returns. */
	answer: Result<void, { reason: string }>;
}

export function fakeEmailSender(): FakeEmailSender {
	const fake: FakeEmailSender = {
		sent: [],
		answer: ok(undefined),
		async send(message) {
			if (fake.answer.ok) fake.sent.push(message);
			return fake.answer;
		}
	};
	return fake;
}
