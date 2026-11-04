import { MongoServerError } from 'mongodb';
import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/mongo.js';
import { createIdGenerator } from '../../domain/id.js';
import type { User } from '../../domain/user.js';
import { manualClock } from '../../testing/clock.js';
import {
	mongoPendingSignIns,
	mongoSessions,
	mongoUsers,
	PENDING_SIGN_INS,
	SESSIONS,
	USERS
} from './auth-collections.js';
import { migrate, migrations } from './migrations/index.js';

const db = useTestDatabase();
const ids = createIdGenerator(Date.now);
const at = new Date('2026-11-01T10:00:00Z');
const ISSUER = 'https://auth.example/';

beforeAll(async () => {
	await migrate(db.mongo.db, migrations, { clock: manualClock() });
});

const newUser = (overrides: Partial<User> = {}): User => ({
	id: ids.next(),
	identities: [{ issuer: ISSUER, subject: `google|${ids.next()}`, linkedAt: at }],
	email: `${ids.next()}@example.com`,
	displayName: 'Sam',
	displayNameSource: 'provider',
	version: 1,
	createdAt: at,
	updatedAt: at,
	...overrides
});

describe('mongoUsers', () => {
	const users = () => mongoUsers(db.mongo.db);

	it('finds a user by ID, identity and email', async () => {
		const user = newUser({ avatarUrl: 'https://img.example/a.jpg' });
		await users().insert(user);
		const { issuer, subject } = user.identities[0]!;
		expect(await users().findById(user.id)).toEqual(user);
		expect(await users().findByIdentity(issuer, subject)).toEqual(user);
		expect(await users().findByEmail(user.email)).toEqual(user);
		expect(await users().findByIdentity(issuer, 'someone-else')).toBeNull();
		expect(await users().findByIdentity('https://other.example/', subject)).toBeNull();
	});

	it('links another identity, found by either', async () => {
		const user = newUser();
		await users().insert(user);
		const linked = { issuer: ISSUER, subject: 'auth0|abc', linkedAt: at };
		await users().addIdentity(user.id, linked, at);
		expect((await users().findByIdentity(ISSUER, 'auth0|abc'))?.id).toBe(user.id);
		expect((await users().findById(user.id))?.identities).toEqual([user.identities[0], linked]);
	});

	it('updates the profile, removing an avatar that is gone', async () => {
		const user = newUser({ avatarUrl: 'https://img.example/a.jpg' });
		await users().insert(user);
		const later = new Date(at.getTime() + 1000);
		await users().updateProfile(
			user.id,
			{ email: user.email, displayName: 'Sam D.', displayNameSource: 'provider' },
			later
		);
		const found = await users().findById(user.id);
		expect(found).toMatchObject({ displayName: 'Sam D.', version: 2, updatedAt: later });
		expect(found).not.toHaveProperty('avatarUrl');
	});

	it('renames at the expected version only, and counts the change', async () => {
		const user = newUser();
		await users().insert(user);
		const later = new Date(at.getTime() + 1000);
		expect(await users().rename(user.id, 'Sammy', 1, later)).toEqual({
			ok: true,
			value: {
				...user,
				displayName: 'Sammy',
				displayNameSource: 'user',
				version: 2,
				updatedAt: later
			}
		});
		expect(await users().rename(user.id, 'Old tab', 1, later)).toEqual({
			ok: false,
			error: { kind: 'stale-version' }
		});
		expect((await users().findById(user.id))?.displayName).toBe('Sammy');
	});

	it("doesn't rename a missing or deleted user", async () => {
		const deleted = newUser();
		await users().insert(deleted);
		await db.mongo.db.collection(USERS).updateOne({ _id: deleted.id } as never, {
			$set: { deletedAt: at }
		});
		const notFound = { ok: false, error: { kind: 'not-found', resource: 'user' } };
		expect(await users().rename(deleted.id, 'Sammy', 1, at)).toEqual(notFound);
		expect(await users().rename(ids.next(), 'Sammy', 1, at)).toEqual(notFound);
	});

	it('reads schema 1 users, which have no name source', async () => {
		const [fromEmail, fromProvider] = [newUser(), newUser()];
		const v1 = (u: User, displayName: string) => ({
			_id: u.id,
			identities: u.identities.map((i) => ({ ...i, key: `${i.issuer} ${i.subject}` })),
			email: u.email,
			displayName,
			version: 3,
			createdAt: at,
			updatedAt: at,
			schemaVersion: 1
		});
		await db.mongo.db
			.collection(USERS)
			.insertMany([
				v1(fromEmail, fromEmail.email.split('@')[0]!),
				v1(fromProvider, 'Sam Doe')
			] as never[]);
		expect(await users().findById(fromEmail.id)).toMatchObject({
			displayNameSource: 'email',
			version: 3
		});
		expect((await users().findById(fromProvider.id))?.displayNameSource).toBe('provider');
	});

	it('allows one user per identity and per email', async () => {
		const first = newUser();
		await users().insert(first);
		const duplicateKey = expect.objectContaining({ code: 11000 });

		const sameIdentity = newUser({ identities: first.identities });
		await expect(users().insert(sameIdentity)).rejects.toBeInstanceOf(MongoServerError);
		await expect(users().insert(sameIdentity)).rejects.toEqual(duplicateKey);
		await expect(users().insert(newUser({ email: first.email }))).rejects.toEqual(duplicateKey);

		const second = newUser();
		await users().insert(second);
		await expect(users().addIdentity(second.id, first.identities[0]!, at)).rejects.toEqual(
			duplicateKey
		);
	});
});

describe('mongoSessions', () => {
	const sessions = () => mongoSessions(db.mongo.db);
	const session = (hash: string) => ({
		tokenHash: hash,
		userId: ids.next(),
		createdAt: at,
		expiresAt: new Date(at.getTime() + 60_000),
		absoluteExpiresAt: new Date(at.getTime() + 120_000),
		extendedAt: at
	});

	it('finds a session only until it expires', async () => {
		const s = session('hash-live');
		await sessions().insert(s);
		expect(await sessions().findLive('hash-live', at)).toEqual(s);
		expect(await sessions().findLive('hash-live', s.expiresAt)).toBeNull();
		expect(await sessions().findLive('unknown', at)).toBeNull();
	});

	it('extends, never past the absolute expiry it was given', async () => {
		const s = session('hash-extend');
		await sessions().insert(s);
		const later = new Date(at.getTime() + 30_000);
		const expiresAt = new Date(at.getTime() + 90_000);
		await sessions().extend('hash-extend', expiresAt, later);
		expect(await sessions().findLive('hash-extend', new Date(at.getTime() + 61_000))).toEqual({
			...s,
			expiresAt,
			extendedAt: later
		});
		expect(await sessions().findLive('hash-extend', s.absoluteExpiresAt)).toBeNull();
	});

	it('deletes', async () => {
		await sessions().insert(session('hash-delete'));
		await sessions().delete('hash-delete');
		expect(await sessions().findLive('hash-delete', at)).toBeNull();
	});

	it('has TTL indexes that clear expired sessions and sign-ins', async () => {
		for (const name of [SESSIONS, PENDING_SIGN_INS]) {
			const indexes = await db.mongo.db.collection(name).indexes();
			expect(indexes).toContainEqual(
				expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 })
			);
		}
	});
});

describe('mongoPendingSignIns', () => {
	const pending = () => mongoPendingSignIns(db.mongo.db);
	const checks = { state: 's', nonce: 'n', codeVerifier: 'v' };

	it('hands a pending sign-in out once', async () => {
		const p = {
			handleHash: 'h1',
			checks,
			returnTo: '/plan',
			expiresAt: new Date(at.getTime() + 60_000)
		};
		await pending().insert(p);
		expect(await pending().take('h1', at)).toEqual(p);
		expect(await pending().take('h1', at)).toBeNull();
	});

	it('refuses (and removes) an expired one', async () => {
		await pending().insert({ handleHash: 'h2', checks, returnTo: '/', expiresAt: at });
		expect(await pending().take('h2', at)).toBeNull();
		const raw = db.mongo.db.collection<{ _id: string }>(PENDING_SIGN_INS);
		expect(await raw.countDocuments({ _id: 'h2' })).toBe(0);
	});
});
