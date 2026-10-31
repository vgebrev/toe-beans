import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
	it('defaults to local', () => {
		expect(loadConfig({})).toEqual({ appEnv: 'local', logLevel: 'info' });
	});

	it('treats empty variables as unset', () => {
		expect(loadConfig({ APP_ENV: '', LOG_LEVEL: '' })).toEqual({
			appEnv: 'local',
			logLevel: 'info'
		});
	});

	it('reads the variables', () => {
		expect(loadConfig({ APP_ENV: 'prod', LOG_LEVEL: 'debug' })).toEqual({
			appEnv: 'prod',
			logLevel: 'debug'
		});
	});

	it('lists every bad variable without echoing values', () => {
		const secret = 's3cr3t-value';
		const load = () => loadConfig({ APP_ENV: secret, LOG_LEVEL: 'loud' });
		expect(load).toThrow(ConfigError);
		expect(load).toThrow(/APP_ENV.*\n.*LOG_LEVEL/);
		try {
			load();
		} catch (e) {
			expect(String(e)).not.toContain(secret);
		}
	});
});
