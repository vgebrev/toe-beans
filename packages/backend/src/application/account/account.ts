// The signed-in person's own account (architecture §5.2). The display name is the app's once the
// person sets it: sign-ins only fill in a missing real name (domain/user.ts, nameAfterSignIn).
// Deleting it is S16.5's route to erase personal data (NFR-02, architecture §5.3, D38).
import { validationError } from '../../domain/errors.js';
import { membersAfterLeaving } from '../../domain/household.js';
import type { Id } from '../../domain/id.js';
import { DISPLAY_NAME_MAX, cleanDisplayName, type User } from '../../domain/user.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { AuthContext } from '../auth/auth.js';
import {
	notFound,
	staleVersion,
	unavailable,
	type NotFoundError,
	type StaleVersionError,
	type UnavailableError,
	type ValidationError
} from '../errors.js';
import { createErasure } from '../household/erasure.js';
import type { Ports } from '../ports/index.js';

export interface Profile {
	displayName: string;
	email: string;
	/** For the ETag (NFR-13). */
	version: number;
}

const profileOf = ({ displayName, email, version }: User): Profile => ({
	displayName,
	email,
	version
});

export type Account = ReturnType<typeof createAccount>;

export function createAccount(
	ports: Pick<
		Ports,
		| 'users'
		| 'sessions'
		| 'identityAccounts'
		| 'households'
		| 'householdData'
		| 'invitations'
		| 'photos'
		| 'pushDevices'
		| 'reminderPreferences'
		| 'reminders'
		| 'uow'
		| 'clock'
		| 'logger'
		| 'errors'
	>
) {
	const {
		users,
		sessions,
		identityAccounts,
		households,
		invitations,
		pushDevices,
		reminderPreferences,
		reminders,
		uow,
		clock,
		logger,
		errors
	} = ports;
	const log = logger.child({ component: 'account' });
	const erasure = createErasure(ports);

	/**
	 * The households only this person can reach, which go with the account: the one they're in, if
	 * nobody else is, and those they were the last to leave (D18). Revokes the first's invitations,
	 * so nobody can join it while it's deleted.
	 */
	async function householdsToErase(userId: Id): Promise<Id[]> {
		const [current, former] = await Promise.all([
			households.findForMember(userId),
			households.listDeactivatedBy(userId)
		]);
		const erase = former.map((h) => h.id);
		if (current?.memberships.length === 1) {
			await invitations.revokeOpen(current.id, clock.now());
			// Someone may have joined just before the invitations stopped working.
			const after = await households.find(current.id);
			if (after?.memberships.length === 1) erase.push(current.id);
		}
		return erase;
	}

	return {
		async profile(ctx: AuthContext): Promise<Result<Profile, NotFoundError>> {
			const user = await users.findById(ctx.userId);
			if (!user || user.deletedAt) return err(notFound('account'));
			return ok(profileOf(user));
		},

		/** Sets the name the household sees, if `expectedVersion` is still current. */
		async rename(
			ctx: AuthContext,
			input: { displayName: string; expectedVersion: number }
		): Promise<Result<Profile, ValidationError | NotFoundError | StaleVersionError>> {
			const displayName = cleanDisplayName(input.displayName);
			if (!displayName) {
				return err(
					validationError('The name is not valid.', {
						displayName: [`Enter a name of up to ${DISPLAY_NAME_MAX} characters.`]
					})
				);
			}
			const renamed = await users.rename(
				ctx.userId,
				displayName,
				input.expectedVersion,
				clock.now()
			);
			if (!renamed.ok) {
				return err(renamed.error.kind === 'not-found' ? notFound('account') : renamed.error);
			}
			log.info('display name changed', { userId: ctx.userId });
			return ok(profileOf(renamed.value));
		},

		/**
		 * Deletes the person's account and what's theirs (S16.5, D38): their accounts at the identity
		 * provider, their devices, reminder settings, sessions and user. If others share their
		 * household they leave it as D18 says, and what they recorded stays for the others, by "a
		 * former member" (names come from users, and theirs is gone). If nobody does, the household
		 * goes too, with its dogs, photos and history, as do households only they could bring back.
		 *
		 * Each step can be repeated, and the user goes last, so after a failure the person is still
		 * signed in and can try again: the provider first (unavailable if it can't be reached), then
		 * the photos, then the records in one transaction.
		 */
		async delete(
			ctx: AuthContext
		): Promise<Result<void, NotFoundError | StaleVersionError | UnavailableError>> {
			const { userId } = ctx;
			const user = await users.findById(userId);
			if (!user) return err(notFound('account'));
			const erase = await householdsToErase(userId);
			try {
				await identityAccounts.delete(user.identities);
			} catch (e) {
				log.error('could not delete the provider accounts', { err: e, userId });
				errors.capture(e, { component: 'account' });
				return err(unavailable("Couldn't reach the sign-in service. Try again in a minute."));
			}
			let photoCount = 0;
			for (const householdId of erase) photoCount += await erasure.erasePhotos(householdId);

			type Failure = StaleVersionError;
			const deleted = await uow.run<number, Failure>(async () => {
				const household = await households.findForMember(userId);
				if (household && !erase.includes(household.id)) {
					const remaining = membersAfterLeaving(household.memberships, userId);
					// Everyone else left meanwhile: start again, and it goes with the account.
					if (remaining.length === 0) return err(staleVersion);
					const left = await households.setMembers(household.id, remaining, {
						expectedVersion: household.version,
						at: clock.now()
					});
					if (!left.ok) return left;
					// Signed up again, they could come back with these (D18).
					await invitations.revokeOpen(household.id, clock.now(), {
						createdBy: userId,
						email: user.email
					});
				}
				let documents = 0;
				for (const householdId of erase) documents += await erasure.eraseRecords(householdId);
				await pushDevices.removeAllForUser(userId);
				await reminderPreferences.delete(userId);
				await reminders.deleteForUser(userId);
				await sessions.deleteForUser(userId);
				await users.delete(userId);
				return ok(documents);
			});
			if (!deleted.ok) return deleted;
			log.info('account deleted', {
				userId,
				households: erase.length,
				documents: deleted.value,
				photos: photoCount
			});
			return ok(undefined);
		}
	};
}
