// Creating a household, seeing who's in it, people leaving it, and deleting it (architecture §5.2,
// FR-01, D18, D38).
import { validationError } from '../../domain/errors.js';
import {
	HOUSEHOLD_NAME_MAX,
	cleanHouseholdName,
	cleanTimeZone,
	deactivatedCutoff,
	keptUntil,
	membersAfterLeaving,
	ownerCount,
	type Household,
	type Role
} from '../../domain/household.js';
import type { Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { AuthContext, MemberContext } from '../auth/auth.js';
import {
	conflictError,
	forbidden,
	notFound,
	staleVersion,
	type ConflictError,
	type ForbiddenError,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import type { Ports } from '../ports/index.js';
import { createErasure } from './erasure.js';

export interface MemberView {
	id: Id;
	displayName: string;
	role: Role;
	joinedAt: Date;
	you: boolean;
	canRemove: boolean;
	canMakeOwner: boolean;
	canStepDown: boolean;
}

export interface HouseholdView {
	name: string;
	timeZone: string;
	members: MemberView[];
	/** For the ETag (NFR-13). */
	version: number;
}

export type Households = ReturnType<typeof createHouseholds>;

export function createHouseholds(
	ports: Pick<
		Ports,
		| 'households'
		| 'householdData'
		| 'invitations'
		| 'users'
		| 'photos'
		| 'uow'
		| 'clock'
		| 'ids'
		| 'logger'
		| 'errors'
	>
) {
	const { households, invitations, users, uow, clock, ids, logger } = ports;
	const log = logger.child({ component: 'household' });
	const erasure = createErasure(ports);

	async function viewOf(household: Household, userId: Id): Promise<HouseholdView> {
		const people = await users.findByIds(household.memberships.map((m) => m.userId));
		const names = new Map(people.map((u) => [u.id, u.displayName]));
		const owners = ownerCount(household.memberships);
		const isOwner = household.memberships.some((m) => m.userId === userId && m.role === 'owner');
		const members = household.memberships.flatMap(({ userId: id, role, joinedAt }) => {
			const displayName = names.get(id);
			if (displayName === undefined) return [];
			const you = id === userId;
			const caregiver = role === 'caregiver';
			return [
				{
					id,
					displayName,
					role,
					joinedAt,
					you,
					canRemove: isOwner && caregiver,
					canMakeOwner: isOwner && caregiver,
					canStepDown: you && !caregiver && owners > 1
				}
			];
		});
		const { name, timeZone, version } = household;
		return { name, timeZone, members, version };
	}

	return {
		/** Makes the person the owner of a new household. A conflict if they already have one. */
		async create(
			ctx: AuthContext,
			input: { name: string; timeZone: string }
		): Promise<Result<HouseholdView, ValidationError | ConflictError>> {
			const name = cleanHouseholdName(input.name);
			const timeZone = cleanTimeZone(input.timeZone);
			if (!name || !timeZone) {
				return err(
					validationError('The household is not valid.', {
						...(!name && {
							name: [`Enter a name of up to ${HOUSEHOLD_NAME_MAX} characters.`]
						}),
						...(!timeZone && { timeZone: ['Choose a time zone from the list.'] })
					})
				);
			}
			const now = clock.now();
			const household: Household = {
				id: ids.next(),
				name,
				timeZone,
				memberships: [{ userId: ctx.userId, role: 'owner', joinedAt: now }],
				version: 1,
				createdAt: now,
				updatedAt: now
			};
			const inserted = await households.insert(household);
			if (!inserted.ok) return inserted;
			log.info('household created', { householdId: household.id, userId: ctx.userId });
			return ok(await viewOf(household, ctx.userId));
		},

		async view(ctx: MemberContext): Promise<Result<HouseholdView, NotFoundError>> {
			const household = await households.find(ctx.householdId);
			if (!household) return err(notFound('household'));
			return ok(await viewOf(household, ctx.userId));
		},

		/**
		 * Takes someone out, which is leaving when it's the person asking; removing a caregiver
		 * takes an owner, and owners can't remove each other (D19). Whether they leave or are
		 * removed, the invitations they made or were sent stop working, as they could come back
		 * with them (D18). The last person out deactivates the household, and with nobody left to
		 * watch its invitations, they all stop working: a link accepted now would hand a stranger
		 * the household.
		 */
		async removeMember(
			ctx: MemberContext,
			input: { memberId: string; expectedVersion: number }
		): Promise<Result<void, NotFoundError | ForbiddenError | StaleVersionError>> {
			const leaving = input.memberId === ctx.userId;
			if (!leaving && ctx.role !== 'owner') return err(forbidden);
			const { householdId } = ctx;
			type Failure = NotFoundError | ForbiddenError | StaleVersionError;
			const result = await uow.run<void, Failure>(async () => {
				const household = await households.find(householdId);
				const member = household?.memberships.find((m) => m.userId === input.memberId);
				if (!household || !member) return err(notFound('member'));
				if (!leaving && member.role === 'owner') return err(forbidden);
				const at = clock.now();
				const written = { expectedVersion: input.expectedVersion, at };
				const remaining = membersAfterLeaving(household.memberships, member.userId);
				if (remaining.length === 0) {
					const deactivated = await households.deactivate(householdId, member.userId, written);
					if (!deactivated.ok) return deactivated;
					await invitations.revokeOpen(householdId, at);
					return ok(undefined);
				}
				const saved = await households.setMembers(householdId, remaining, written);
				if (!saved.ok) return saved;
				const user = await users.findById(member.userId);
				if (user) {
					await invitations.revokeOpen(householdId, at, {
						createdBy: user.id,
						email: user.email
					});
				}
				return ok(undefined);
			});
			if (result.ok) {
				const event = leaving ? 'member left household' : 'member removed from household';
				log.info(event, { householdId, userId: input.memberId });
			}
			return result;
		},

		/**
		 * Only owners change roles. An owner can make a caregiver an owner, or step down themselves
		 * while another owner stays, but can't demote anyone else (D19).
		 */
		async changeRole(
			ctx: MemberContext,
			input: { memberId: string; role: Role; expectedVersion: number }
		): Promise<Result<void, NotFoundError | ForbiddenError | ConflictError | StaleVersionError>> {
			if (ctx.role !== 'owner') return err(forbidden);
			const { householdId } = ctx;
			const household = await households.find(householdId);
			const member = household?.memberships.find((m) => m.userId === input.memberId);
			if (!household || !member) return err(notFound('member'));
			if (member.role === input.role) return ok(undefined);
			if (input.role === 'caregiver') {
				if (member.userId !== ctx.userId) return err(forbidden);
				if (ownerCount(household.memberships) < 2) {
					return err(conflictError('A household needs an owner.'));
				}
			}
			const memberships = household.memberships.map((m) =>
				m.userId === member.userId ? { ...m, role: input.role } : m
			);
			const saved = await households.setMembers(householdId, memberships, {
				expectedVersion: input.expectedVersion,
				at: clock.now()
			});
			if (saved.ok) {
				log.info('member role changed', { householdId, userId: member.userId, role: input.role });
			}
			return saved;
		},

		/**
		 * Deletes the household with its dogs, photos and history (D38). Only its one member can,
		 * so nobody loses data they're still using; anyone else leaves instead.
		 */
		async delete(
			ctx: MemberContext,
			input: { expectedVersion: number }
		): Promise<Result<void, NotFoundError | ConflictError | StaleVersionError>> {
			const { householdId, userId } = ctx;
			type Failure = NotFoundError | ConflictError | StaleVersionError;
			const check = async (): Promise<Result<void, Failure>> => {
				const household = await households.find(householdId);
				if (!household) return err(notFound('household'));
				if (household.version !== input.expectedVersion) return err(staleVersion);
				if (household.memberships.length !== 1 || household.memberships[0]!.userId !== userId) {
					return err(conflictError('Others are still in the household.'));
				}
				return ok(undefined);
			};
			const checked = await check();
			if (!checked.ok) return checked;
			// Nobody can join from here on, which is what makes deleting the photos safe. Revoking
			// changes only the invitations, not the household's version.
			await invitations.revokeOpen(householdId, clock.now());
			const photoCount = await erasure.erasePhotos(householdId);
			const erased = await uow.run<number, Failure>(async () => {
				const stillAlone = await check();
				return stillAlone.ok ? ok(await erasure.eraseRecords(householdId)) : stillAlone;
			});
			if (!erased.ok) return erased;
			log.info('household deleted', {
				householdId,
				userId,
				documents: erased.value,
				photos: photoCount
			});
			return ok(undefined);
		},

		/**
		 * The household this person can bring back, if there is one, and until when: after that
		 * it's deleted (D18, D38).
		 */
		async findReactivatable(
			ctx: AuthContext
		): Promise<Result<{ name: string; keptUntil: Date }, NotFoundError>> {
			const household = await households.findDeactivatedBy(
				ctx.userId,
				deactivatedCutoff(clock.now())
			);
			if (!household?.deactivated) return err(notFound('household'));
			return ok({ name: household.name, keptUntil: keptUntil(household.deactivated.at) });
		},

		/** Deletes the household they were the last to leave now, rather than when it runs out. */
		async deleteFormer(ctx: AuthContext): Promise<Result<void, NotFoundError>> {
			const household = await households.findDeactivatedBy(
				ctx.userId,
				deactivatedCutoff(clock.now())
			);
			if (!household) return err(notFound('household'));
			// Deactivating it revoked its invitations, and only this person can bring it back.
			const photoCount = await erasure.erasePhotos(household.id);
			const erased = await uow.run<number, NotFoundError>(async () => {
				const current = await households.findDeactivatedBy(ctx.userId, new Date(0));
				if (current?.id !== household.id) return err(notFound('household'));
				return ok(await erasure.eraseRecords(household.id));
			});
			if (!erased.ok) return erased;
			log.info('household deleted', {
				householdId: household.id,
				userId: ctx.userId,
				documents: erased.value,
				photos: photoCount
			});
			return ok(undefined);
		},

		/** Brings back the household they were the last to leave, with them as its owner. */
		async reactivate(
			ctx: AuthContext
		): Promise<Result<HouseholdView, NotFoundError | ConflictError>> {
			const now = clock.now();
			const since = deactivatedCutoff(now);
			const household = await households.findDeactivatedBy(ctx.userId, since);
			if (!household) return err(notFound('household'));
			const reactivated = await households.reactivate(
				household.id,
				{ userId: ctx.userId, role: 'owner', joinedAt: now },
				now,
				since
			);
			if (!reactivated.ok) return reactivated;
			log.info('household reactivated', { householdId: household.id, userId: ctx.userId });
			const current = await households.find(household.id);
			return current ? ok(await viewOf(current, ctx.userId)) : err(notFound('household'));
		}
	};
}
