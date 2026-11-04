// In-memory doubles for the sign-in ports, for unit tests of the auth use cases. The Mongo
// adapters have their own integration tests.
import type {
	IdentityClaims,
	IdentityFailure,
	IdentityProvider,
	PendingSignIn,
	PendingSignInRepository,
	Session,
	SessionRepository,
	UnitOfWork,
	UserRepository
} from '../application/ports/index.js';
import { notFound, staleVersion } from '../application/errors.js';
import { err, ok, type Result } from '../domain/result.js';
import type { User } from '../domain/user.js';

export interface FakeIdentityProvider extends IdentityProvider {
	/** What the next `completeSignIn` returns. */
	answer: Result<IdentityClaims, IdentityFailure>;
	/** The checks and URL `completeSignIn` was last given. */
	last?: { callbackUrl: URL; checks: PendingSignIn['checks'] };
}

export function fakeIdentityProvider(): FakeIdentityProvider {
	let n = 0;
	const fake: FakeIdentityProvider = {
		answer: { ok: false, error: { kind: 'failed', reason: 'no answer set' } },
		async beginSignIn({ redirectUri, prompt }) {
			n++;
			const checks = { state: `state-${n}`, nonce: `nonce-${n}`, codeVerifier: `verifier-${n}` };
			const query = new URLSearchParams({ redirect_uri: redirectUri, state: checks.state });
			if (prompt) query.set('prompt', prompt);
			return { url: `https://idp.example/authorize?${query}`, checks };
		},
		async completeSignIn(callbackUrl, checks) {
			fake.last = { callbackUrl, checks };
			return fake.answer;
		},
		async signOutUrl(postSignOutUri) {
			return `https://idp.example/logout?post_logout_redirect_uri=${encodeURIComponent(postSignOutUri)}`;
		}
	};
	return fake;
}

export function memoryUsers(): UserRepository & { all(): User[] } {
	const users = new Map<string, User>();
	const find = (match: (u: User) => boolean) =>
		structuredClone([...users.values()].find(match) ?? null);
	return {
		all: () => structuredClone([...users.values()]),
		findById: async (id) => find((u) => u.id === id),
		findByIdentity: async (issuer, subject) =>
			find((u) => u.identities.some((i) => i.issuer === issuer && i.subject === subject)),
		findByEmail: async (email) => find((u) => u.email === email),
		async insert(user) {
			if ([...users.values()].some((u) => u.email === user.email)) throw new Error('duplicate');
			users.set(user.id, structuredClone(user));
		},
		async addIdentity(id, identity, at) {
			const u = users.get(id)!;
			u.identities.push(structuredClone(identity));
			Object.assign(u, { updatedAt: at, version: u.version + 1 });
		},
		async updateProfile(id, { email, displayName, displayNameSource, avatarUrl }, at) {
			const u = users.get(id)!;
			Object.assign(u, { email, displayName, displayNameSource, updatedAt: at });
			u.version++;
			if (avatarUrl) u.avatarUrl = avatarUrl;
			else delete u.avatarUrl;
		},
		async rename(id, displayName, expectedVersion, at) {
			const u = users.get(id);
			if (!u || u.deletedAt) return err(notFound('user'));
			if (u.version !== expectedVersion) return err(staleVersion);
			Object.assign(u, { displayName, displayNameSource: 'user', updatedAt: at });
			u.version++;
			return ok(structuredClone(u));
		}
	};
}

export function memorySessions(): SessionRepository & { all(): Session[] } {
	const sessions = new Map<string, Session>();
	return {
		all: () => structuredClone([...sessions.values()]),
		async insert(s) {
			sessions.set(s.tokenHash, structuredClone(s));
		},
		async findLive(tokenHash, now) {
			const s = sessions.get(tokenHash);
			return s && s.expiresAt > now && s.absoluteExpiresAt > now ? structuredClone(s) : null;
		},
		async extend(tokenHash, expiresAt, at) {
			const s = sessions.get(tokenHash);
			if (s) Object.assign(s, { expiresAt, extendedAt: at });
		},
		async delete(tokenHash) {
			sessions.delete(tokenHash);
		}
	};
}

export function memoryPendingSignIns(): PendingSignInRepository {
	const pending = new Map<string, PendingSignIn>();
	return {
		async insert(p) {
			pending.set(p.handleHash, structuredClone(p));
		},
		async take(handleHash, now) {
			const p = pending.get(handleHash);
			pending.delete(handleHash);
			return p && p.expiresAt > now ? p : null;
		}
	};
}

/** Runs the work directly: no rollback, which unit tests of these use cases don't need. */
export const directUnitOfWork: UnitOfWork = { run: (work) => work() };
