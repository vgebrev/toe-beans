// Sign-in, sessions and sign-out (architecture §3.4, NFR-01). The http layer turns these results
// into redirects and cookies; nothing here knows about either.
import type { Id } from '../../domain/id.js';
import { err, ok, type Result } from '../../domain/result.js';
import { hashSecretToken, isSecretToken, newSecretToken } from '../../domain/secret-token.js';
import { displayNameFor, normaliseEmail, type User } from '../../domain/user.js';
import type { IdentityClaims, Ports } from '../ports/index.js';

/**
 * Who is making a request, resolved from the session. Use cases take it explicitly and never read
 * a request (architecture §4.2). S2 adds `householdId` and `role` from the membership.
 */
export interface AuthContext {
	userId: Id;
}

/** The signed-in person, as the app shows them. */
export interface Viewer {
	auth: AuthContext;
	displayName: string;
	email: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A session ends after 90 days without use… */
export const SESSION_IDLE_MS = 90 * DAY_MS;
/** …or 400 days after sign-in, Chrome's cap on a cookie's lifetime. */
export const SESSION_ABSOLUTE_MS = 400 * DAY_MS;
/** Use moves the idle expiry at most this often, so reading a page rarely writes. */
export const SESSION_EXTEND_EVERY_MS = DAY_MS;
/** Time allowed between leaving for the provider and coming back. */
export const SIGN_IN_TTL_MS = 10 * 60 * 1000;

export interface SignInFailure {
	/** `email-unverified`: the provider hasn't verified the email yet, so no user or session is made. */
	kind: 'failed' | 'email-unverified';
	returnTo: string;
}

export interface NewSession {
	token: string;
	expiresAt: Date;
	returnTo: string;
}

export interface AuthOptions {
	/** Our callback URL on the public origin, registered with the provider. */
	callbackUri: string;
	/** Where the provider sends the browser after signing out, also registered. */
	postSignOutUri: string;
}

export type Auth = ReturnType<typeof createAuth>;

export function createAuth(
	{
		identity,
		users,
		sessions,
		pendingSignIns,
		uow,
		clock,
		ids,
		logger
	}: Pick<
		Ports,
		'identity' | 'users' | 'sessions' | 'pendingSignIns' | 'uow' | 'clock' | 'ids' | 'logger'
	>,
	{ callbackUri, postSignOutUri }: AuthOptions
) {
	const log = logger.child({ component: 'auth' });

	/**
	 * Finds the user for these claims, linking a new identity to an existing user with the same
	 * verified email (Q10), or creates one. Returns null for a deleted user.
	 */
	async function userFor(claims: IdentityClaims & { email: string }): Promise<User | null> {
		const now = clock.now();
		const email = normaliseEmail(claims.email);
		const profile = {
			email,
			displayName: displayNameFor(claims.name, email),
			avatarUrl: claims.picture
		};

		const known = await users.findByIdentity(claims.issuer, claims.subject);
		if (known) {
			if (known.deletedAt) return null;
			if (email !== known.email && (await users.findByEmail(email))) {
				// The provider's email changed to one another user already has. Merging two users
				// silently would be worse than a stale email, so keep the old one.
				log.warn('email change not applied: another user has that email', { userId: known.id });
				profile.email = known.email;
			}
			await users.updateProfile(known.id, profile, now);
			return { ...known, ...profile, updatedAt: now };
		}

		const sameEmail = await users.findByEmail(email);
		if (sameEmail) {
			if (sameEmail.deletedAt) return null;
			const linked = { issuer: claims.issuer, subject: claims.subject, linkedAt: now };
			await users.addIdentity(sameEmail.id, linked, now);
			await users.updateProfile(sameEmail.id, profile, now);
			log.info('sign-in method linked to an existing user', { userId: sameEmail.id });
			return {
				...sameEmail,
				...profile,
				identities: [...sameEmail.identities, linked],
				updatedAt: now
			};
		}

		const user: User = {
			id: ids.next(),
			identities: [{ issuer: claims.issuer, subject: claims.subject, linkedAt: now }],
			...profile,
			createdAt: now,
			updatedAt: now
		};
		if (!user.avatarUrl) delete user.avatarUrl;
		await users.insert(user);
		log.info('user created', { userId: user.id });
		return user;
	}

	return {
		/** Starts a sign-in: the provider URL to redirect to and the handle for the browser's cookie. */
		async startSignIn(input: {
			returnTo: string;
			prompt?: 'login';
		}): Promise<{ url: string; handle: string }> {
			const { url, checks } = await identity.beginSignIn({
				redirectUri: callbackUri,
				...(input.prompt && { prompt: input.prompt })
			});
			const handle = newSecretToken();
			await pendingSignIns.insert({
				handleHash: hashSecretToken(handle),
				checks,
				returnTo: input.returnTo,
				expiresAt: new Date(clock.now().getTime() + SIGN_IN_TTL_MS)
			});
			return { url, handle };
		},

		/**
		 * Finishes a sign-in at the callback: validates the provider's answer, finds or creates the
		 * user and starts a session. `previousToken` (a session cookie already present) is ended.
		 */
		async finishSignIn(input: {
			callbackUrl: URL;
			handle: string | undefined;
			previousToken?: string | undefined;
		}): Promise<Result<NewSession, SignInFailure>> {
			const pending =
				input.handle && isSecretToken(input.handle)
					? await pendingSignIns.take(hashSecretToken(input.handle), clock.now())
					: null;
			if (!pending) {
				// Expired, used already, or another tab started a newer sign-in.
				log.warn('sign-in failed', { reason: 'no pending sign-in' });
				return err({ kind: 'failed', returnTo: '/' });
			}
			const { returnTo } = pending;

			const claims = await identity.completeSignIn(input.callbackUrl, pending.checks);
			if (!claims.ok) {
				if (claims.error.kind === 'denied') log.info('sign-in cancelled or denied');
				else log.warn('sign-in failed', { reason: claims.error.reason });
				return err({ kind: 'failed', returnTo });
			}
			const { email, emailVerified } = claims.value;
			if (!email || !emailVerified) {
				// Linking by email is only safe for verified emails, or anyone could register
				// someone else's address and take over their account (architecture §3.4).
				log.info('sign-in refused: email not verified');
				return err({ kind: 'email-unverified', returnTo });
			}

			const found = await uow.run(async () => ok(await userFor({ ...claims.value, email })));
			const user = found.ok ? found.value : null;
			if (!user) {
				log.warn('sign-in refused: user deleted');
				return err({ kind: 'failed', returnTo });
			}

			if (input.previousToken && isSecretToken(input.previousToken)) {
				await sessions.delete(hashSecretToken(input.previousToken));
			}
			const now = clock.now();
			const token = newSecretToken();
			const expiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
			await sessions.insert({
				tokenHash: hashSecretToken(token),
				userId: user.id,
				createdAt: now,
				expiresAt,
				absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
				extendedAt: now
			});
			log.info('signed in', { userId: user.id });
			return ok({ token, expiresAt, returnTo });
		},

		/**
		 * The viewer for a session cookie, or null when signed out. `renewedUntil` is set when the
		 * session's expiry moved, so the cookie's should move with it.
		 */
		async authenticate(
			token: string | undefined
		): Promise<{ viewer: Viewer; renewedUntil?: Date } | null> {
			if (!token || !isSecretToken(token)) return null;
			const tokenHash = hashSecretToken(token);
			const now = clock.now();
			const session = await sessions.findLive(tokenHash, now);
			if (!session) return null;
			const user = await users.findById(session.userId);
			if (!user || user.deletedAt) {
				await sessions.delete(tokenHash);
				return null;
			}
			const viewer = {
				auth: { userId: user.id },
				displayName: user.displayName,
				email: user.email
			};

			if (now.getTime() - session.extendedAt.getTime() < SESSION_EXTEND_EVERY_MS) {
				return { viewer };
			}
			const renewedUntil = new Date(
				Math.min(now.getTime() + SESSION_IDLE_MS, session.absoluteExpiresAt.getTime())
			);
			await sessions.extend(tokenHash, renewedUntil, now);
			return { viewer, renewedUntil };
		},

		/** Ends the session and returns the provider's sign-out URL to redirect to. */
		async signOut(token: string | undefined): Promise<{ url: string }> {
			if (token && isSecretToken(token)) await sessions.delete(hashSecretToken(token));
			try {
				return { url: await identity.signOutUrl(postSignOutUri) };
			} catch (e) {
				// Signed out here even if the provider is unreachable; its own session just lingers.
				log.warn('provider sign-out URL unavailable', { err: e });
				return { url: postSignOutUri };
			}
		}
	};
}
