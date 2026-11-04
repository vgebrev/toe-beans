// Mongo adapters for users, sessions and pending sign-ins (architecture §3.4). Indexes, including
// the TTLs that clear expired sessions, are created by migration 0001.
import type { Db } from 'mongodb';
import type {
	PendingSignIn,
	PendingSignInRepository,
	Session,
	SessionRepository,
	UserRepository
} from '../../application/ports/index.js';
import { notFound, staleVersion } from '../../application/errors.js';
import type { Id } from '../../domain/id.js';
import { err, ok } from '../../domain/result.js';
import type { DisplayNameSource, Identity, User } from '../../domain/user.js';
import { currentSession } from './unit-of-work.js';

export const USERS = 'users';
export const SESSIONS = 'sessions';
export const PENDING_SIGN_INS = 'pendingSignIns';

interface IdentityDoc extends Identity {
	/** `issuer` and `subject` in one string: the unique index needs a single array field. */
	key: string;
}

interface UserDoc {
	_id: Id;
	identities: IdentityDoc[];
	email: string;
	displayName: string;
	/** Since schema 2. */
	displayNameSource?: DisplayNameSource;
	avatarUrl?: string;
	deletedAt?: Date;
	version: number;
	createdAt: Date;
	updatedAt: Date;
	schemaVersion: number;
}

/** 2 added `displayNameSource`. */
const USER_SCHEMA = 2;

/**
 * Schema 1 didn't record where the name came from. It was always the provider's, or the email's
 * local part when the provider had none, so the name itself tells.
 */
const sourceOf = (doc: UserDoc): DisplayNameSource =>
	doc.displayNameSource ?? (doc.displayName === doc.email.split('@')[0] ? 'email' : 'provider');

// A space can't appear in an issuer URL, so the key is unambiguous.
const identityKey = (issuer: string, subject: string) => `${issuer} ${subject}`;
const identityDoc = (i: Identity): IdentityDoc => ({ ...i, key: identityKey(i.issuer, i.subject) });

function toUser(doc: UserDoc): User {
	const user: User = {
		id: doc._id,
		identities: doc.identities.map(({ issuer, subject, linkedAt }) => ({
			issuer,
			subject,
			linkedAt
		})),
		email: doc.email,
		displayName: doc.displayName,
		displayNameSource: sourceOf(doc),
		version: doc.version,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt
	};
	if (doc.avatarUrl) user.avatarUrl = doc.avatarUrl;
	if (doc.deletedAt) user.deletedAt = doc.deletedAt;
	return user;
}

export function mongoUsers(db: Db): UserRepository {
	const users = db.collection<UserDoc>(USERS);
	const one = async (filter: object) => {
		const doc = await users.findOne(filter, { session: currentSession() });
		return doc && toUser(doc);
	};
	return {
		findById: (id) => one({ _id: id }),
		findByIdentity: (issuer, subject) => one({ 'identities.key': identityKey(issuer, subject) }),
		findByEmail: (email) => one({ email }),
		async insert(user) {
			await users.insertOne(
				{
					_id: user.id,
					identities: user.identities.map(identityDoc),
					email: user.email,
					displayName: user.displayName,
					displayNameSource: user.displayNameSource,
					...(user.avatarUrl && { avatarUrl: user.avatarUrl }),
					version: user.version,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
					schemaVersion: USER_SCHEMA
				},
				{ session: currentSession() }
			);
		},
		async addIdentity(id, identity, at) {
			await users.updateOne(
				{ _id: id },
				{
					$push: { identities: identityDoc(identity) },
					$set: { updatedAt: at },
					$inc: { version: 1 }
				},
				{ session: currentSession() }
			);
		},
		async updateProfile(id, { email, displayName, displayNameSource, avatarUrl }, at) {
			await users.updateOne(
				{ _id: id },
				{
					$set: {
						email,
						displayName,
						displayNameSource,
						updatedAt: at,
						schemaVersion: USER_SCHEMA,
						...(avatarUrl && { avatarUrl })
					},
					...(!avatarUrl && { $unset: { avatarUrl: '' } }),
					$inc: { version: 1 }
				},
				{ session: currentSession() }
			);
		},
		async rename(id, displayName, expectedVersion, at) {
			const live = { _id: id, deletedAt: { $exists: false } };
			const doc = await users.findOneAndUpdate(
				{ ...live, version: expectedVersion },
				{
					$set: {
						displayName,
						displayNameSource: 'user',
						updatedAt: at,
						schemaVersion: USER_SCHEMA
					},
					$inc: { version: 1 }
				},
				{ returnDocument: 'after', session: currentSession() }
			);
			if (doc) return ok(toUser(doc));
			const exists = await users.countDocuments(live, { limit: 1, session: currentSession() });
			return err(exists ? staleVersion : notFound('user'));
		}
	};
}

interface SessionDoc extends Omit<Session, 'tokenHash'> {
	_id: string;
	schemaVersion: number;
}

export function mongoSessions(db: Db): SessionRepository {
	const sessions = db.collection<SessionDoc>(SESSIONS);
	return {
		async insert({ tokenHash, ...rest }) {
			await sessions.insertOne({ _id: tokenHash, ...rest, schemaVersion: 1 });
		},
		async findLive(tokenHash, now) {
			// The TTL index removes expired sessions only about once a minute, so check here too.
			const doc = await sessions.findOne({
				_id: tokenHash,
				expiresAt: { $gt: now },
				absoluteExpiresAt: { $gt: now }
			});
			if (!doc) return null;
			const { userId, createdAt, expiresAt, absoluteExpiresAt, extendedAt } = doc;
			return { tokenHash: doc._id, userId, createdAt, expiresAt, absoluteExpiresAt, extendedAt };
		},
		async extend(tokenHash, expiresAt, at) {
			await sessions.updateOne({ _id: tokenHash }, { $set: { expiresAt, extendedAt: at } });
		},
		async delete(tokenHash) {
			await sessions.deleteOne({ _id: tokenHash });
		}
	};
}

interface PendingSignInDoc extends Omit<PendingSignIn, 'handleHash'> {
	_id: string;
}

export function mongoPendingSignIns(db: Db): PendingSignInRepository {
	const pending = db.collection<PendingSignInDoc>(PENDING_SIGN_INS);
	return {
		async insert({ handleHash, ...rest }) {
			await pending.insertOne({ _id: handleHash, ...rest });
		},
		async take(handleHash, now) {
			const doc = await pending.findOneAndDelete({ _id: handleHash });
			if (!doc || doc.expiresAt <= now) return null;
			const { _id, ...rest } = doc;
			return { handleHash: _id, ...rest };
		}
	};
}
