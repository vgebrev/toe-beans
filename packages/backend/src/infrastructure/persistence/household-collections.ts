// Mongo adapters for households and invitations (architecture §3.5, §4.4). Indexes are created by
// migration 0002. A household is the isolation boundary itself, so its document has no
// `householdId` and it doesn't build on HouseholdCollection; invitations do.
import { MongoServerError, type Collection, type Db } from 'mongodb';
import type {
	Clock,
	HouseholdRepository,
	InvitationRepository
} from '../../application/ports/index.js';
import { conflictError, staleVersion } from '../../application/errors.js';
import type { Household, Membership } from '../../domain/household.js';
import type { Id } from '../../domain/id.js';
import { invitationState, type Invitation } from '../../domain/invitation.js';
import { err, ok } from '../../domain/result.js';
import { HouseholdCollection, type HouseholdDocument } from './household-collection.js';
import { currentSession } from './unit-of-work.js';

export const HOUSEHOLDS = 'households';
export const INVITATIONS = 'invitations';

const HOUSEHOLD_SCHEMA = 1;
const INVITATION_SCHEMA = 1;

interface HouseholdDoc extends Omit<Household, 'id'> {
	_id: Id;
	schemaVersion: number;
}

function toHousehold({ _id, schemaVersion: _, ...rest }: HouseholdDoc): Household {
	return { id: _id, ...rest };
}

const alreadyInOne = conflictError('This person already belongs to a household.');
const isDuplicateKey = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

export function mongoHouseholds(db: Db): HouseholdRepository {
	const households = db.collection<HouseholdDoc>(HOUSEHOLDS);
	const one = async (filter: object) => {
		const doc = await households.findOne(filter, { session: currentSession() });
		return doc && toHousehold(doc);
	};
	return {
		async insert({ id, ...rest }) {
			try {
				await households.insertOne(
					{ _id: id, ...rest, schemaVersion: HOUSEHOLD_SCHEMA },
					{ session: currentSession() }
				);
				return ok(undefined);
			} catch (e) {
				if (isDuplicateKey(e)) return err(alreadyInOne);
				throw e;
			}
		},
		find: (id) => one({ _id: id }),
		async findByIds(ids) {
			if (ids.length === 0) return [];
			const docs = await households
				.find({ _id: { $in: [...ids] } }, { session: currentSession() })
				.toArray();
			return docs.map(toHousehold);
		},
		findForMember: (userId) => one({ 'memberships.userId': userId }),
		async findDeactivatedBy(userId) {
			const [doc] = await households
				.find({ 'deactivated.by': userId }, { session: currentSession() })
				.sort({ 'deactivated.at': -1 })
				.limit(1)
				.toArray();
			return doc ? toHousehold(doc) : null;
		},
		async addMember(id, membership: Membership, at) {
			try {
				// The unique index stops a second household, but not the same member twice in one.
				const { matchedCount } = await households.updateOne(
					{
						_id: id,
						deactivated: { $exists: false },
						'memberships.userId': { $ne: membership.userId }
					},
					{ $push: { memberships: membership }, $set: { updatedAt: at }, $inc: { version: 1 } },
					{ session: currentSession() }
				);
				return matchedCount === 1 ? ok(undefined) : err(alreadyInOne);
			} catch (e) {
				if (isDuplicateKey(e)) return err(alreadyInOne);
				throw e;
			}
		},
		async setMembers(id, memberships, { expectedVersion, at }) {
			const { matchedCount } = await households.updateOne(
				{ _id: id, version: expectedVersion },
				{ $set: { memberships, updatedAt: at }, $inc: { version: 1 } },
				{ session: currentSession() }
			);
			return matchedCount === 1 ? ok(undefined) : err(staleVersion);
		},
		async deactivate(id, by, { expectedVersion, at }) {
			const { matchedCount } = await households.updateOne(
				{ _id: id, version: expectedVersion },
				{ $set: { memberships: [], deactivated: { at, by }, updatedAt: at }, $inc: { version: 1 } },
				{ session: currentSession() }
			);
			return matchedCount === 1 ? ok(undefined) : err(staleVersion);
		},
		async reactivate(id, owner, at) {
			try {
				const { matchedCount } = await households.updateOne(
					{ _id: id, deactivated: { $exists: true } },
					{
						$set: { memberships: [owner], updatedAt: at },
						$unset: { deactivated: '' },
						$inc: { version: 1 }
					},
					{ session: currentSession() }
				);
				return matchedCount === 1 ? ok(undefined) : err(alreadyInOne);
			} catch (e) {
				if (isDuplicateKey(e)) return err(alreadyInOne);
				throw e;
			}
		}
	};
}

type InvitationDoc = HouseholdDocument &
	Omit<Invitation, 'id' | 'householdId' | 'version' | 'createdAt' | 'updatedAt'>;

function toInvitation({ _id, schemaVersion: _, ...rest }: InvitationDoc): Invitation {
	return { id: _id, ...rest };
}

export function mongoInvitations(db: Db, clock: Clock): InvitationRepository {
	const raw: Collection<InvitationDoc> = db.collection<InvitationDoc>(INVITATIONS);
	const invitations = new HouseholdCollection<InvitationDoc>(raw, {
		resource: 'invitation',
		schemaVersion: INVITATION_SCHEMA,
		clock
	});
	return {
		async insert({ id, householdId, ...fields }) {
			return toInvitation(await invitations.insert(householdId, id, { ...fields, useCount: 0 }));
		},
		async findById(householdId, id) {
			const doc = await invitations.findById(householdId, id);
			return doc && toInvitation(doc);
		},
		async findOpen(householdId, now) {
			const docs = await invitations.find(
				householdId,
				{ revokedAt: { $exists: false }, expiresAt: { $gt: now } },
				{ sort: { _id: -1 } }
			);
			return docs.map(toInvitation).filter((i) => invitationState(i, now) === 'open');
		},
		async findByTokenHash(tokenHash) {
			const doc = await raw.findOne({ tokenHash }, { session: currentSession() });
			return doc && toInvitation(doc as InvitationDoc);
		},
		async claim(householdId, id, now) {
			const { modifiedCount } = await raw.updateOne(
				{
					_id: id,
					householdId,
					revokedAt: { $exists: false },
					expiresAt: { $gt: now },
					$expr: { $lt: ['$useCount', '$maxUses'] }
				},
				{ $inc: { useCount: 1, version: 1 }, $set: { updatedAt: now } },
				{ session: currentSession() }
			);
			return modifiedCount === 1;
		},
		async revoke(householdId, id, expectedVersion, at) {
			const revoked = await invitations.update(householdId, id, expectedVersion, { revokedAt: at });
			return revoked.ok ? ok(toInvitation(revoked.value)) : revoked;
		},
		async revokeOpen(householdId, at, only) {
			await raw.updateMany(
				{
					householdId,
					revokedAt: { $exists: false },
					expiresAt: { $gt: at },
					...(only && { $or: [{ createdBy: only.createdBy }, { email: only.email }] })
				},
				{ $set: { revokedAt: at, updatedAt: at }, $inc: { version: 1 } },
				{ session: currentSession() }
			);
		},
		async remove(householdId, id) {
			await raw.deleteOne({ _id: id, householdId }, { session: currentSession() });
		}
	};
}
