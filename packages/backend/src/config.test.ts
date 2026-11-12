import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';
import { PUSH_SERVICES } from './domain/reminders.js';

const localMongo = { uri: 'mongodb://localhost:27017/?directConnection=true', db: 'toe-beans' };
const atlas = 'mongodb+srv://app:pw@cluster.example.net/?retryWrites=true';
const local = {
	appEnv: 'local',
	logLevel: 'info',
	mongodb: localMongo,
	publicOrigin: 'http://localhost:7877',
	oidc: {
		issuer: 'http://localhost:8090/default',
		clientId: 'toe-beans-local',
		clientSecret: 'local-secret'
	},
	authRateLimit: { limit: 30, windowMs: 600_000 },
	inviteRateLimit: { limit: 30, windowMs: 600_000 },
	email: { kind: 'console' },
	photos: { kind: 'filesystem', directory: '.data/photos' },
	push: { subject: 'mailto:hello@toebeans.co.za', allowedEndpoints: [...PUSH_SERVICES] },
	worker: { mode: 'inline', intervalMs: 300_000, auth: {} }
};
const vapid = { VAPID_PUBLIC_KEY: 'B'.repeat(87), VAPID_PRIVATE_KEY: 'p'.repeat(43) };
const scheduler = {
	TICK_AUDIENCE: 'https://toebeans.co.za/internal/tick',
	TICK_INVOKER: 'toe-beans-tick@toe-beans-co-za.iam.gserviceaccount.com'
};
const auth0 = {
	OIDC_ISSUER: 'https://auth.toebeans.co.za/',
	OIDC_CLIENT_ID: 'client',
	OIDC_CLIENT_SECRET: 'secret'
};
const r2 = {
	S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
	S3_BUCKET: 'toe-beans-photos',
	S3_ACCESS_KEY_ID: 'key-id',
	S3_SECRET_ACCESS_KEY: 'key-secret'
};
const prod = {
	APP_ENV: 'prod',
	MONGODB_URI: atlas,
	PUBLIC_BASE_URL: 'https://toebeans.co.za',
	RESEND_API_KEY: 're_key',
	...auth0,
	...r2,
	...vapid,
	...scheduler
};

describe('loadConfig', () => {
	it('defaults to local', () => {
		expect(loadConfig({})).toEqual(local);
	});

	it('treats empty variables as unset', () => {
		expect(
			loadConfig({
				APP_ENV: '',
				LOG_LEVEL: '',
				MONGODB_URI: '',
				MONGODB_DB: '',
				PUBLIC_BASE_URL: '',
				OIDC_ISSUER: ''
			})
		).toEqual(local);
	});

	it('reads the variables', () => {
		expect(loadConfig({ ...prod, LOG_LEVEL: 'debug', MONGODB_DB: 'tb' })).toEqual({
			appEnv: 'prod',
			logLevel: 'debug',
			mongodb: { uri: atlas, db: 'tb' },
			publicOrigin: 'https://toebeans.co.za',
			oidc: { issuer: auth0.OIDC_ISSUER, clientId: 'client', clientSecret: 'secret' },
			authRateLimit: { limit: 30, windowMs: 600_000 },
			inviteRateLimit: { limit: 30, windowMs: 600_000 },
			email: { kind: 'resend', apiKey: 're_key', from: 'Toe Beans <invites@toebeans.co.za>' },
			photos: {
				kind: 's3',
				endpoint: r2.S3_ENDPOINT,
				bucket: 'toe-beans-photos',
				region: 'auto',
				accessKeyId: 'key-id',
				secretAccessKey: 'key-secret'
			},
			push: {
				vapid: { publicKey: vapid.VAPID_PUBLIC_KEY, privateKey: vapid.VAPID_PRIVATE_KEY },
				subject: 'https://toebeans.co.za',
				allowedEndpoints: [...PUSH_SERVICES]
			},
			worker: {
				mode: 'http',
				intervalMs: 300_000,
				auth: { google: { audience: scheduler.TICK_AUDIENCE, invoker: scheduler.TICK_INVOKER } }
			}
		});
	});

	describe('reminders', () => {
		it('need lasting VAPID keys and a way to run the tick in prod', () => {
			const noKeys = { ...prod, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' };
			expect(() => loadConfig(noKeys)).toThrow(/VAPID_PUBLIC_KEY: required in prod/);
			const noTick = { ...prod, TICK_AUDIENCE: '', TICK_INVOKER: '' };
			expect(() => loadConfig(noTick)).toThrow(/TICK_AUDIENCE: required with WORKER_MODE=http/);
			const secret = 's'.repeat(32);
			expect(loadConfig({ ...noTick, TICK_SECRET: secret }).worker.auth).toEqual({ secret });
			expect(loadConfig({ ...noTick, WORKER_MODE: 'inline' }).worker.mode).toBe('inline');
		});

		it('take both VAPID keys or neither, and both scheduler settings or neither', () => {
			expect(() => loadConfig({ VAPID_PUBLIC_KEY: vapid.VAPID_PUBLIC_KEY })).toThrow(
				/VAPID_PRIVATE_KEY: set both/
			);
			expect(() => loadConfig({ TICK_AUDIENCE: scheduler.TICK_AUDIENCE })).toThrow(/TICK_INVOKER/);
			expect(() => loadConfig({ VAPID_PUBLIC_KEY: 'short', VAPID_PRIVATE_KEY: 'x' })).toThrow(
				ConfigError
			);
		});

		it('allow an extra push service origin for tests, never in prod', () => {
			expect(
				loadConfig({ PUSH_SERVICE_ORIGINS: 'http://localhost:4174' }).push.allowedEndpoints
			).toEqual([...PUSH_SERVICES, 'http://localhost:4174']);
			expect(() => loadConfig({ PUSH_SERVICE_ORIGINS: 'http://localhost:4174/push' })).toThrow(
				/must be origins/
			);
			expect(() => loadConfig({ ...prod, PUSH_SERVICE_ORIGINS: 'http://x:1' })).toThrow(
				/not allowed in prod/
			);
		});

		it('take the tick interval in minutes', () => {
			expect(loadConfig({ TICK_INTERVAL_MINUTES: '1' }).worker.intervalMs).toBe(60_000);
			expect(() => loadConfig({ TICK_INTERVAL_MINUTES: '0' })).toThrow(ConfigError);
		});
	});

	describe('photo store', () => {
		it('is a local directory unless told otherwise', () => {
			expect(loadConfig({ PHOTO_DIR: '/tmp/photos' }).photos).toEqual({
				kind: 'filesystem',
				directory: '/tmp/photos'
			});
		});

		it('takes a bucket only with all its settings', () => {
			expect(loadConfig({ PHOTO_STORE: 's3', ...r2, S3_REGION: 'us-east-1' }).photos).toMatchObject(
				{ kind: 's3', region: 'us-east-1' }
			);
			expect(() => loadConfig({ PHOTO_STORE: 's3', ...r2, S3_SECRET_ACCESS_KEY: '' })).toThrow(
				/S3_SECRET_ACCESS_KEY: required with PHOTO_STORE=s3/
			);
			expect(() => loadConfig({ PHOTO_STORE: 's3', ...r2, S3_BUCKET: 'No_Caps' })).toThrow(
				/S3_BUCKET/
			);
		});

		it('is a bucket in prod, or a directory only when one is named', () => {
			expect(() => loadConfig({ ...prod, S3_BUCKET: '' })).toThrow(/S3_BUCKET/);
			expect(() => loadConfig({ ...prod, PHOTO_STORE: 'filesystem' })).toThrow(
				/PHOTO_DIR: required with PHOTO_STORE=filesystem in prod/
			);
			expect(
				loadConfig({ ...prod, PHOTO_STORE: 'filesystem', PHOTO_DIR: '/data/photos' }).photos
			).toEqual({ kind: 'filesystem', directory: '/data/photos' });
		});

		it('never puts the secret key in an error', () => {
			expect(() => loadConfig({ ...prod, S3_ENDPOINT: 'nope' })).toThrow(
				expect.not.objectContaining({ message: expect.stringContaining('key-secret') })
			);
		});
	});

	it('reads the sign-in rate limit, refusing one that would block every sign-in', () => {
		expect(loadConfig({ AUTH_RATE_LIMIT: '1000' }).authRateLimit.limit).toBe(1000);
		expect(() => loadConfig({ AUTH_RATE_LIMIT: '1' })).toThrow(/AUTH_RATE_LIMIT/);
		expect(() => loadConfig({ AUTH_RATE_LIMIT: 'lots' })).toThrow(/AUTH_RATE_LIMIT/);
	});

	it('reads the Sentry DSN and release, preferring APP_RELEASE to K_REVISION', () => {
		const dsn = 'https://abc123@o1.ingest.sentry.io/42';
		expect(loadConfig({ SENTRY_DSN: dsn, K_REVISION: 'web-00012-xyz' })).toMatchObject({
			sentry: { dsn },
			release: 'web-00012-xyz'
		});
		expect(loadConfig({ APP_RELEASE: '1.2.0', K_REVISION: 'web-00012-xyz' }).release).toBe('1.2.0');
		expect(loadConfig({})).not.toHaveProperty('sentry');
		expect(() => loadConfig({ SENTRY_DSN: 'http://abc@sentry.example/1' })).toThrow(/SENTRY_DSN/);
	});

	it('requires MONGODB_URI in prod', () => {
		expect(() => loadConfig({ ...prod, MONGODB_URI: '' })).toThrow(/MONGODB_URI: required in prod/);
	});

	it('requires https sign-in settings in prod, never the local mock provider', () => {
		expect(() => loadConfig({ APP_ENV: 'prod', MONGODB_URI: atlas })).toThrow(
			/PUBLIC_BASE_URL: required in prod\n.*OIDC_ISSUER: required in prod/
		);
		expect(() => loadConfig({ ...prod, PUBLIC_BASE_URL: 'http://toebeans.co.za' })).toThrow(
			/PUBLIC_BASE_URL: must be https in prod/
		);
		expect(() => loadConfig({ ...prod, OIDC_ISSUER: 'http://localhost:8090/default' })).toThrow(
			/OIDC_ISSUER: must be https in prod/
		);
	});

	describe('the email sender', () => {
		const from = 'Toe Beans <invites@toebeans.co.za>';

		it('prints locally unless told otherwise, even with a Resend key to hand', () => {
			expect(loadConfig({}).email).toEqual({ kind: 'console' });
			expect(loadConfig({ RESEND_API_KEY: 're_key' }).email).toEqual({ kind: 'console' });
		});

		it('uses Mailpit when asked, on its default address or another', () => {
			expect(loadConfig({ EMAIL_SENDER: 'mailpit' }).email).toEqual({
				kind: 'mailpit',
				url: 'http://localhost:8025',
				from
			});
			const elsewhere = { EMAIL_SENDER: 'mailpit', MAILPIT_URL: 'http://mail.test:9000' };
			expect(loadConfig(elsewhere).email).toMatchObject({ url: 'http://mail.test:9000' });
		});

		it('uses Resend locally only when asked, and then needs the key', () => {
			expect(loadConfig({ EMAIL_SENDER: 'resend', RESEND_API_KEY: 're_key' }).email).toEqual({
				kind: 'resend',
				apiKey: 're_key',
				from
			});
			expect(() => loadConfig({ EMAIL_SENDER: 'resend' })).toThrow(
				/RESEND_API_KEY: required to send through Resend/
			);
		});

		it('is Resend in prod, and nothing else will do', () => {
			expect(loadConfig(prod).email).toMatchObject({ kind: 'resend' });
			expect(() => loadConfig({ ...prod, RESEND_API_KEY: '' })).toThrow(/RESEND_API_KEY/);
			// The console sender prints invite links, which must never reach production logs.
			for (const EMAIL_SENDER of ['console', 'mailpit']) {
				expect(() => loadConfig({ ...prod, EMAIL_SENDER })).toThrow(
					/EMAIL_SENDER: must be resend in prod/
				);
			}
		});

		it('refuses a sender it does not know', () => {
			expect(() => loadConfig({ EMAIL_SENDER: 'pigeon' })).toThrow(/EMAIL_SENDER/);
		});
	});

	it('takes a real provider only with its client credentials', () => {
		expect(loadConfig(auth0).oidc).toEqual({
			issuer: auth0.OIDC_ISSUER,
			clientId: 'client',
			clientSecret: 'secret'
		});
		expect(() => loadConfig({ OIDC_ISSUER: auth0.OIDC_ISSUER })).toThrow(
			/OIDC_CLIENT_ID: required with OIDC_ISSUER\n.*OIDC_CLIENT_SECRET/
		);
	});

	it('takes the public origin without a trailing slash, and refuses a path', () => {
		expect(loadConfig({ PUBLIC_BASE_URL: 'http://192.168.1.20:7877/' }).publicOrigin).toBe(
			'http://192.168.1.20:7877'
		);
		expect(() => loadConfig({ PUBLIC_BASE_URL: 'https://toebeans.co.za/app' })).toThrow(
			/PUBLIC_BASE_URL: must be an origin/
		);
	});

	it('lists every bad variable without echoing values', () => {
		const secret = 's3cr3t-value';
		const load = () =>
			loadConfig({ APP_ENV: secret, LOG_LEVEL: 'loud', MONGODB_URI: `https://${secret}` });
		expect(load).toThrow(ConfigError);
		expect(load).toThrow(/APP_ENV.*\n.*LOG_LEVEL.*\n.*MONGODB_URI/);
		try {
			load();
		} catch (e) {
			expect(String(e)).not.toContain(secret);
		}
	});
});
