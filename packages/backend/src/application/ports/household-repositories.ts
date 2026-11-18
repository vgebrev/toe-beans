// Storage for households and invitations (architecture §4.4). Invitations belong to a household, so
// every method but the token lookup takes one. That lookup is how a person outside the household
// reaches an invitation: holding the token is the authority, and the household comes from the
// document it finds.
import type { Household, Membership } from '../../domain/household.js';
import type { Id } from '../../domain/id.js';
import type { Invitation } from '../../domain/invitation.js';
import type { Result } from '../../domain/result.js';
import type { ConflictError, NotFoundError, StaleVersionError } from '../errors.js';

export interface WrittenAt {
	expectedVersion: number;
	at: Date;
}

export interface HouseholdRepository {
	/** A conflict if a member of `household` already belongs to one (architecture D16). */
	insert(household: Household): Promise<Result<void, ConflictError>>;
	/** The household's own ID comes from the AuthContext, so this can't reach another one. */
	find(id: Id): Promise<Household | null>;
	/** For the reminder tick, which works across households (D27). */
	findByIds(ids: readonly Id[]): Promise<Household[]>;
	/** The household this person belongs to, if any. */
	findForMember(userId: Id): Promise<Household | null>;
	/**
	 * The household this person was the last to leave, most recent first, if it was deactivated
	 * after `since`: older ones are past bringing back (D18, D38).
	 */
	findDeactivatedBy(userId: Id, since: Date): Promise<Household | null>;
	/** Every household this person was the last to leave, however long ago: for deleting them. */
	listDeactivatedBy(userId: Id): Promise<Household[]>;
	/** Up to `limit` households deactivated before `before`, oldest first: for the tick to delete. */
	findDeactivatedBefore(before: Date, limit: number): Promise<Household[]>;
	/** A conflict if they're already in a household, or this one is deactivated. */
	addMember(id: Id, membership: Membership, at: Date): Promise<Result<void, ConflictError>>;
	/** Replaces who's in it, if it's still at `expectedVersion`. */
	setMembers(
		id: Id,
		memberships: Membership[],
		written: WrittenAt
	): Promise<Result<void, StaleVersionError>>;
	/** Empties it, if it's still at `expectedVersion`. */
	deactivate(id: Id, by: Id, written: WrittenAt): Promise<Result<void, StaleVersionError>>;
	/**
	 * Makes them its owner if it was deactivated after `since`. A conflict if it isn't, or they're
	 * in another.
	 */
	reactivate(
		id: Id,
		owner: Membership,
		at: Date,
		since: Date
	): Promise<Result<void, ConflictError>>;
}

/**
 * Deletes a household's records (architecture §5.3, D38): the household itself and every document
 * that carries its `householdId`, in every collection, so a collection added later is covered
 * without changing this. Joins the caller's transaction. Photos aren't documents: delete them from
 * the PhotoStore by `householdPhotoPrefix`. Only use cases that have checked nobody else can
 * reach the household call this.
 */
export interface HouseholdData {
	/** Returns how many documents went, the household's own included. */
	erase(householdId: Id): Promise<number>;
}

export type NewInvitation = Omit<Invitation, 'version' | 'createdAt' | 'updatedAt' | 'useCount'>;

export interface InvitationRepository {
	insert(invitation: NewInvitation): Promise<Invitation>;
	findById(householdId: Id, id: Id): Promise<Invitation | null>;
	/** Not revoked, not expired at `now` and not used up; newest first. */
	findOpen(householdId: Id, now: Date): Promise<Invitation[]>;
	findByTokenHash(tokenHash: string): Promise<Invitation | null>;
	/** Takes one use if the invitation is still open at `now`, atomically. False if it isn't. */
	claim(householdId: Id, id: Id, now: Date): Promise<boolean>;
	/** Revokes it if it's still at `expectedVersion` (NFR-13). */
	revoke(
		householdId: Id,
		id: Id,
		expectedVersion: number,
		at: Date
	): Promise<Result<Invitation, NotFoundError | StaleVersionError>>;
	/**
	 * Revokes what can still be used, whatever its version: leaving these open is the risk. With
	 * `only`, just those made by that person or sent to that address.
	 */
	revokeOpen(householdId: Id, at: Date, only?: { createdBy: Id; email: string }): Promise<void>;
	/** Removes one that never reached anyone, such as when its email couldn't be sent. */
	remove(householdId: Id, id: Id): Promise<void>;
	/**
	 * Email invitations made since `since`, in every household, or only those `by` one person or
	 * household. Removed ones (never sent) don't count; revoked ones do.
	 */
	countEmailsSince(since: Date, by?: { createdBy: Id } | { householdId: Id }): Promise<number>;
}
