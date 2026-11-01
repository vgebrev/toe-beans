import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const localMongo = { uri: 'mongodb://localhost:27017/?directConnection=true', db: 'toe-beans' };
const atlas = 'mongodb+srv://app:pw@cluster.example.net/?retryWrites=true';

describe('loadConfig', () => {
	it('defaults to local', () => {
		expect(loadConfig({})).toEqual({ appEnv: 'local', logLevel: 'info', mongodb: localMongo });
	});

	it('treats empty variables as unset', () => {
		expect(loadConfig({ APP_ENV: '', LOG_LEVEL: '', MONGODB_URI: '', MONGODB_DB: '' })).toEqual({
			appEnv: 'local',
			logLevel: 'info',
			mongodb: localMongo
		});
	});

	it('reads the variables', () => {
		expect(
			loadConfig({ APP_ENV: 'prod', LOG_LEVEL: 'debug', MONGODB_URI: atlas, MONGODB_DB: 'tb' })
		).toEqual({ appEnv: 'prod', logLevel: 'debug', mongodb: { uri: atlas, db: 'tb' } });
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
		expect(() => loadConfig({ APP_ENV: 'prod' })).toThrow(/MONGODB_URI: required in prod/);
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
