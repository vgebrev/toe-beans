import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdGenerator, type Id } from '../../domain/id.js';
import { err, ok } from '../../domain/result.js';
import { hashSecretToken } from '../../domain/secret-token.js';
import {
	directUnitOfWork,
	fakeIdentityProvider,
	memoryPendingSignIns,
	memorySessions,
	memoryUsers
} from '../../testing/auth.js';
import { manualClock } from '../../testing/clock.js';
import { memoryHouseholds } from '../../testing/household.js';
import type { IdentityClaims, Logger } from '../ports/index.js';
import {
	createAuth,
	SESSION_ABSOLUTE_MS,
	SESSION_EXTEND_EVERY_MS,
	SESSION_IDLE_MS,
	SIGN_IN_TTL_MS
} from './auth.js';

const DAY = 24 * 60 * 60 * 1000;
const ISSUER = 'https://auth.example/';
const callbackUri = 'https://app.example/auth/callback';

function setup() {
	const clock = manualClock('2026-11-01T10:00:00Z');
	const identity = fakeIdentityProvider();
	const users = memoryUsers();
	const households = memoryHouseholds();
	const sessions = memorySessions();
	const logger: Logger = {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: () => logger
	};
	const auth = createAuth(
		{
			identity,
			users,
			households,
			sessions,
			pendingSignIns: memoryPendingSignIns(),
			uow: directUnitOfWork,
			clock,
			ids: createIdGenerator(() => clock.now().getTime()),
			logger
		},
		{ callbackUri, postSignOutUri: 'https://app.example/' }
	);
	return { auth, clock, identity, users, households, sessions, logger };
}

const google = (overrides: Partial<IdentityClaims> = {}): IdentityClaims => ({
	issuer: ISSUER,
	subject: 'google-oauth2|1',
	email: 'Sam@Example.com',
	emailVerified: true,
	name: 'Sam Doe',
	picture: 'https://lh3.example/sam.jpg',
	...overrides
});

describe('auth', () => {
	let t: ReturnType<typeof setup>;
	beforeEach(() => {
		t = setup();
	});

	/** Runs the whole flow: start, then the callback with `claims`. */
	async function signIn(claims: IdentityClaims, returnTo = '/', previousToken?: string) {
		const { handle } = await t.auth.startSignIn({ returnTo });
		t.identity.answer = ok(claims);
		return t.auth.finishSignIn({
			callbackUrl: new URL(`${callbackUri}?code=c&state=s`),
			handle,
			previousToken
		});
	}

	describe('startSignIn', () => {
		it('sends the browser to the provider with our callback, and keeps the checks', async () => {
			const { url, handle } = await t.auth.startSignIn({ returnTo: '/plan' });
			expect(new URL(url).searchParams.get('redirect_uri')).toBe(callbackUri);
			expect(handle).toMatch(/^[A-Za-z0-9_-]{43}$/);

			t.identity.answer = ok(google());
			const callbackUrl = new URL(`${callbackUri}?code=c`);
			const result = await t.auth.finishSignIn({ callbackUrl, handle });
			expect(t.identity.last).toEqual({
				callbackUrl,
				checks: { state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' }
			});
			expect(result).toMatchObject({ ok: true, value: { returnTo: '/plan' } });
		});

		it('passes prompt=login on', async () => {
			const { url } = await t.auth.startSignIn({ returnTo: '/', prompt: 'login' });
			expect(new URL(url).searchParams.get('prompt')).toBe('login');
		});
	});

	describe('finishSignIn', () => {
		it('creates a user and a 90-day session for a first sign-in', async () => {
			const result = await signIn(google(), '/history');
			expect(result).toEqual({
				ok: true,
				value: {
					token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
					expiresAt: new Date(t.clock.now().getTime() + SESSION_IDLE_MS),
					returnTo: '/history'
				}
			});
			const [user] = t.users.all();
			expect(user).toMatchObject({
				identities: [{ issuer: ISSUER, subject: 'google-oauth2|1', linkedAt: t.clock.now() }],
				email: 'sam@example.com',
				displayName: 'Sam Doe',
				avatarUrl: 'https://lh3.example/sam.jpg'
			});
			const token = result.ok ? result.value.token : '';
			expect(t.sessions.all()).toEqual([
				{
					tokenHash: hashSecretToken(token),
					userId: user!.id,
					createdAt: t.clock.now(),
					expiresAt: new Date(t.clock.now().getTime() + SESSION_IDLE_MS),
					absoluteExpiresAt: new Date(t.clock.now().getTime() + SESSION_ABSOLUTE_MS),
					extendedAt: t.clock.now()
				}
			]);
		});

		it('finds the same user next time and refreshes the picture, keeping the name', async () => {
			await signIn(google());
			t.clock.advance(DAY);
			await signIn(google({ name: 'Sam D.', picture: undefined }));
			expect(t.users.all()).toEqual([
				expect.objectContaining({
					displayName: 'Sam Doe',
					displayNameSource: 'provider',
					version: 2,
					updatedAt: t.clock.now()
				})
			]);
			expect(t.users.all()[0]).not.toHaveProperty('avatarUrl');
		});

		it("doesn't write when nothing changed, so an open edit isn't made stale", async () => {
			await signIn(google());
			t.clock.advance(DAY);
			await signIn(google());
			expect(t.users.all()[0]).toMatchObject({
				version: 1,
				updatedAt: new Date(t.clock.now().getTime() - DAY)
			});
		});

		describe('the display name', () => {
			const email = google({
				subject: 'auth0|abc',
				email: 'sam@example.com',
				name: 'sam@example.com'
			});

			it("starts from the email when the provider has no name, then takes Google's", async () => {
				await signIn(email);
				expect(t.users.all()[0]).toMatchObject({ displayName: 'sam', displayNameSource: 'email' });
				await signIn(google());
				expect(t.users.all()[0]).toMatchObject({
					displayName: 'Sam Doe',
					displayNameSource: 'provider'
				});
			});

			it("doesn't change with each sign-in method", async () => {
				await signIn(google());
				await signIn(email);
				await signIn(google());
				await signIn(email);
				expect(t.users.all()[0]!.displayName).toBe('Sam Doe');
			});

			it('is never replaced once the person chose it', async () => {
				await signIn(email);
				const { id, version } = t.users.all()[0]!;
				await t.users.rename(id, 'Sammy', version, t.clock.now());
				await signIn(google());
				expect(t.users.all()[0]).toMatchObject({ displayName: 'Sammy', displayNameSource: 'user' });
			});
		});

		it('links a second sign-in method with the same verified email to the same user (Q10)', async () => {
			await signIn(google());
			const result = await signIn(
				google({ subject: 'auth0|abc', email: 'sam@example.com', name: undefined })
			);
			expect(result.ok).toBe(true);
			const users = t.users.all();
			expect(users).toHaveLength(1);
			expect(users[0]!.identities.map((i) => i.subject)).toEqual(['google-oauth2|1', 'auth0|abc']);
			// Either method now reaches the same user.
			expect(new Set(t.sessions.all().map((s) => s.userId))).toEqual(new Set([users[0]!.id]));
		});

		it('refuses an unverified email without making a user or session', async () => {
			const result = await signIn(google({ emailVerified: false }), '/plan');
			expect(result).toEqual(err({ kind: 'email-unverified', returnTo: '/plan' }));
			expect(t.users.all()).toEqual([]);
			expect(t.sessions.all()).toEqual([]);
		});

		it("never links an unverified email to someone else's user", async () => {
			await signIn(google());
			const attacker = google({ subject: 'auth0|evil', emailVerified: false });
			expect(await signIn(attacker)).toMatchObject({ ok: false });
			expect(t.users.all()[0]!.identities).toHaveLength(1);
		});

		it('refuses a sign-in with no email', async () => {
			expect(await signIn(google({ email: undefined }))).toMatchObject({
				ok: false,
				error: { kind: 'email-unverified' }
			});
		});

		it("keeps the old email if the provider's new one belongs to another user", async () => {
			await signIn(google());
			await signIn(google({ subject: 'google-oauth2|2', email: 'alex@example.com' }));
			await signIn(google({ email: 'alex@example.com' }));
			expect(t.users.all().map((u) => u.email)).toEqual(['sam@example.com', 'alex@example.com']);
			expect(t.logger.warn).toHaveBeenCalledWith(
				'email change not applied: another user has that email',
				expect.anything()
			);
		});

		it('fails without a pending sign-in, or with an expired or reused one', async () => {
			const callbackUrl = new URL(callbackUri);
			t.identity.answer = ok(google());
			expect(await t.auth.finishSignIn({ callbackUrl, handle: undefined })).toEqual(
				err({ kind: 'failed', returnTo: '/' })
			);
			expect(await t.auth.finishSignIn({ callbackUrl, handle: 'x'.repeat(43) })).toMatchObject({
				ok: false
			});

			const { handle } = await t.auth.startSignIn({ returnTo: '/' });
			t.clock.advance(SIGN_IN_TTL_MS);
			expect(await t.auth.finishSignIn({ callbackUrl, handle })).toMatchObject({ ok: false });

			const fresh = await t.auth.startSignIn({ returnTo: '/' });
			expect((await t.auth.finishSignIn({ callbackUrl, handle: fresh.handle })).ok).toBe(true);
			expect((await t.auth.finishSignIn({ callbackUrl, handle: fresh.handle })).ok).toBe(false);
			expect(t.sessions.all()).toHaveLength(1);
		});

		it("fails, keeping returnTo, when the provider's answer doesn't validate", async () => {
			const { handle } = await t.auth.startSignIn({ returnTo: '/care' });
			t.identity.answer = err({ kind: 'failed', reason: 'OperationProcessingError' });
			expect(await t.auth.finishSignIn({ callbackUrl: new URL(callbackUri), handle })).toEqual(
				err({ kind: 'failed', returnTo: '/care' })
			);
			expect(t.logger.warn).toHaveBeenCalledWith('sign-in failed', {
				reason: 'OperationProcessingError'
			});
		});

		it('ends the session the browser already had', async () => {
			const first = await signIn(google());
			const token = first.ok ? first.value.token : '';
			await signIn(google(), '/', token);
			expect(t.sessions.all()).toHaveLength(1);
			expect(await t.auth.authenticate(token)).toBeNull();
		});

		it('refuses a deleted user', async () => {
			await signIn(google());
			const id = t.users.all()[0]!.id;
			const users = t.users as unknown as { findByIdentity: typeof t.users.findByIdentity };
			const original = users.findByIdentity;
			users.findByIdentity = async (...args) => {
				const u = await original(...args);
				return u && { ...u, deletedAt: t.clock.now() };
			};
			expect(await signIn(google())).toMatchObject({ ok: false, error: { kind: 'failed' } });
			expect(t.sessions.all().filter((s) => s.userId === id)).toHaveLength(1);
		});
	});

	describe('authenticate', () => {
		async function session() {
			const result = await signIn(google());
			return result.ok ? result.value.token : '';
		}

		it('returns the viewer for a live session', async () => {
			const token = await session();
			expect(await t.auth.authenticate(token)).toEqual({
				viewer: {
					auth: { userId: t.users.all()[0]!.id },
					displayName: 'Sam Doe',
					email: 'sam@example.com',
					member: null
				}
			});
		});

		it('resolves the household from the membership, never from the request', async () => {
			const token = await session();
			const user = t.users.all()[0]!;
			const householdId = 'h1' as Id;
			await t.households.insert({
				id: householdId,
				name: 'The Does',
				timeZone: 'Africa/Johannesburg',
				memberships: [{ userId: user.id, role: 'caregiver', joinedAt: t.clock.now() }],
				version: 1,
				createdAt: t.clock.now(),
				updatedAt: t.clock.now()
			});
			expect((await t.auth.authenticate(token))?.viewer.member).toEqual({
				userId: user.id,
				householdId,
				role: 'caregiver',
				householdName: 'The Does',
				timeZone: 'Africa/Johannesburg'
			});
		});

		it('is null for no cookie, a malformed one or an unknown one', async () => {
			expect(await t.auth.authenticate(undefined)).toBeNull();
			expect(await t.auth.authenticate('not a token')).toBeNull();
			expect(await t.auth.authenticate('A'.repeat(43))).toBeNull();
		});

		it('slides the expiry forward at most once a day', async () => {
			const token = await session();
			t.clock.advance(SESSION_EXTEND_EVERY_MS - 1);
			expect(await t.auth.authenticate(token)).not.toHaveProperty('renewedUntil');

			t.clock.advance(1);
			const renewed = await t.auth.authenticate(token);
			expect(renewed?.renewedUntil).toEqual(new Date(t.clock.now().getTime() + SESSION_IDLE_MS));
			expect(await t.auth.authenticate(token)).not.toHaveProperty('renewedUntil');
		});

		it('ends after 90 days without use', async () => {
			const token = await session();
			t.clock.advance(SESSION_IDLE_MS - 1);
			expect(await t.auth.authenticate(token)).not.toBeNull();
			t.clock.advance(SESSION_IDLE_MS);
			expect(await t.auth.authenticate(token)).toBeNull();
		});

		it('ends 400 days after sign-in however often it is used', async () => {
			const token = await session();
			for (let day = 1; day < 400; day += 30) {
				t.clock.advance(30 * DAY);
				const found = await t.auth.authenticate(token);
				if (!found) break;
				if (found.renewedUntil) {
					expect(found.renewedUntil.getTime()).toBeLessThanOrEqual(
						new Date('2026-11-01T10:00:00Z').getTime() + SESSION_ABSOLUTE_MS
					);
				}
			}
			t.clock.set(new Date(new Date('2026-11-01T10:00:00Z').getTime() + SESSION_ABSOLUTE_MS));
			expect(await t.auth.authenticate(token)).toBeNull();
		});
	});

	describe('signOut', () => {
		it("ends the session and returns the provider's sign-out URL", async () => {
			const result = await signIn(google());
			const token = result.ok ? result.value.token : '';
			expect(await t.auth.signOut(token)).toEqual({
				url: 'https://idp.example/logout?post_logout_redirect_uri=https%3A%2F%2Fapp.example%2F'
			});
			expect(await t.auth.authenticate(token)).toBeNull();
		});

		it('still signs out locally when the provider is unreachable', async () => {
			t.identity.signOutUrl = async () => {
				throw new Error('fetch failed');
			};
			expect(await t.auth.signOut(undefined)).toEqual({ url: 'https://app.example/' });
		});
	});
});
