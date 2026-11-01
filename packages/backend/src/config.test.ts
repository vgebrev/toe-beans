import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

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
	}
};
const auth0 = {
	OIDC_ISSUER: 'https://auth.toebeans.co.za/',
	OIDC_CLIENT_ID: 'client',
	OIDC_CLIENT_SECRET: 'secret'
};
const prod = {
	APP_ENV: 'prod',
	MONGODB_URI: atlas,
	PUBLIC_BASE_URL: 'https://toebeans.co.za',
	...auth0
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
			oidc: { issuer: auth0.OIDC_ISSUER, clientId: 'client', clientSecret: 'secret' }
		});
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
