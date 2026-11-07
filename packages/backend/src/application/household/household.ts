// Creating a household, seeing who's in it, and people leaving it (architecture §5.2, FR-01, D18).
import { validationError } from '../../domain/errors.js';
import {
	HOUSEHOLD_NAME_MAX,
	cleanHouseholdName,
	cleanTimeZone,
	membersAfterLeaving,
	type Household,
	type Role
} from '../../domain/household.js';
import type { Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { AuthContext, MemberContext } from '../auth/auth.js';
import {
	forbidden,
	notFound,
	type ConflictError,
	type ForbiddenError,
	type NotFoundError,
	type StaleVersionError,
	type ValidationError
} from '../errors.js';
import type { Ports } from '../ports/index.js';

export interface MemberView {
	id: Id;
	displayName: string;
	role: Role;
	joinedAt: Date;
	you: boolean;
	canRemove: boolean;
}

export interface HouseholdView {
	name: string;
	timeZone: string;
	members: MemberView[];
	/** For the ETag (NFR-13). */
	version: number;
}

export type Households = ReturnType<typeof createHouseholds>;

export function createHouseholds({
	households,
	invitations,
	users,
	uow,
	clock,
	ids,
	logger
}: Pick<Ports, 'households' | 'invitations' | 'users' | 'uow' | 'clock' | 'ids' | 'logger'>) {
	const log = logger.child({ component: 'household' });

	async function viewOf(household: Household, userId: Id): Promise<HouseholdView> {
		const people = await users.findByIds(household.memberships.map((m) => m.userId));
		const names = new Map(people.map((u) => [u.id, u.displayName]));
		const isOwner = household.memberships.some((m) => m.userId === userId && m.role === 'owner');
		const members = household.memberships.flatMap(({ userId: id, role, joinedAt }) => {
			const displayName = names.get(id);
			if (displayName === undefined) return [];
			const you = id === userId;
			return [{ id, displayName, role, joinedAt, you, canRemove: isOwner && !you }];
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
		 * Takes someone out, which is leaving when it's the person asking; removing anyone else
		 * takes an owner. Someone removed loses the invitations they could come back with. The last
		 * person out deactivates the household, and with nobody left to watch its invitations, they
		 * all stop working: a link accepted now would hand a stranger the household.
		 */
		async removeMember(
			ctx: MemberContext,
			input: { memberId: string; expectedVersion: number }
		): Promise<Result<void, NotFoundError | ForbiddenError | StaleVersionError>> {
			const leaving = input.memberId === ctx.userId;
			if (!leaving && ctx.role !== 'owner') return err(forbidden);
			const { householdId } = ctx;
			const result = await uow.run<void, NotFoundError | StaleVersionError>(async () => {
				const household = await households.find(householdId);
				const member = household?.memberships.find((m) => m.userId === input.memberId);
				if (!household || !member) return err(notFound('member'));
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
				if (!leaving) {
					const user = await users.findById(member.userId);
					if (user) {
						await invitations.revokeOpen(householdId, at, {
							createdBy: user.id,
							email: user.email
						});
					}
				}
				return ok(undefined);
			});
			if (result.ok) {
				const event = leaving ? 'member left household' : 'member removed from household';
				log.info(event, { householdId, userId: input.memberId });
			}
			return result;
		},

		/** The name of the household this person can bring back, if there is one. */
		async findReactivatable(ctx: AuthContext): Promise<Result<{ name: string }, NotFoundError>> {
			const household = await households.findDeactivatedBy(ctx.userId);
			return household ? ok({ name: household.name }) : err(notFound('household'));
		},

		/** Brings back the household they were the last to leave, with them as its owner. */
		async reactivate(
			ctx: AuthContext
		): Promise<Result<HouseholdView, NotFoundError | ConflictError>> {
			const household = await households.findDeactivatedBy(ctx.userId);
			if (!household) return err(notFound('household'));
			const now = clock.now();
			const reactivated = await households.reactivate(
				household.id,
				{ userId: ctx.userId, role: 'owner', joinedAt: now },
				now
			);
			if (!reactivated.ok) return reactivated;
			log.info('household reactivated', { householdId: household.id, userId: ctx.userId });
			const current = await households.find(household.id);
			return current ? ok(await viewOf(current, ctx.userId)) : err(notFound('household'));
		}
	};
}
