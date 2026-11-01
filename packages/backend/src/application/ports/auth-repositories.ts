// Storage for users, sessions and sign-ins in progress (architecture §3.4). None of it is
// household-owned, so these don't build on HouseholdCollection.
import type { Id } from '../../domain/id.js';
import type { Identity, User } from '../../domain/user.js';
import type { SignInChecks } from './identity-provider.js';

export interface UserRepository {
	findById(id: Id): Promise<User | null>;
	findByIdentity(issuer: string, subject: string): Promise<User | null>;
	/** `email` is already normalised. */
	findByEmail(email: string): Promise<User | null>;
	insert(user: User): Promise<void>;
	/** Adds a sign-in method to an existing user. */
	addIdentity(id: Id, identity: Identity, at: Date): Promise<void>;
	updateProfile(
		id: Id,
		profile: Pick<User, 'email' | 'displayName' | 'avatarUrl'>,
		at: Date
	): Promise<void>;
}

export interface Session {
	/** SHA-256 of the cookie's token; the token itself is never stored. */
	tokenHash: string;
	userId: Id;
	createdAt: Date;
	/** Slides forward with use, never past `absoluteExpiresAt`. */
	expiresAt: Date;
	absoluteExpiresAt: Date;
	/** When `expiresAt` last moved, so it moves at most once a day. */
	extendedAt: Date;
}

export interface SessionRepository {
	insert(session: Session): Promise<void>;
	/** The session if it exists and hasn't expired at `now`. */
	findLive(tokenHash: string, now: Date): Promise<Session | null>;
	extend(tokenHash: string, expiresAt: Date, at: Date): Promise<void>;
	delete(tokenHash: string): Promise<void>;
}

/** A sign-in between the redirect to the provider and its callback. */
export interface PendingSignIn {
	/** SHA-256 of the handle in the browser's sign-in cookie. */
	handleHash: string;
	checks: SignInChecks;
	/** Where to go once signed in: a path on our own origin, already checked. */
	returnTo: string;
	expiresAt: Date;
}

export interface PendingSignInRepository {
	insert(pending: PendingSignIn): Promise<void>;
	/** Removes and returns it, if it exists and hasn't expired: each one is used once. */
	take(handleHash: string, now: Date): Promise<PendingSignIn | null>;
}
