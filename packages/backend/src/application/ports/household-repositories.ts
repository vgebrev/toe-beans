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
	/** The household this person belongs to, if any. */
	findForMember(userId: Id): Promise<Household | null>;
	/** The household this person was the last to leave, most recent first (D18). */
	findDeactivatedBy(userId: Id): Promise<Household | null>;
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
	/** Makes them its owner if it's deactivated. A conflict if it isn't, or they're in another. */
	reactivate(id: Id, owner: Membership, at: Date): Promise<Result<void, ConflictError>>;
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
}
