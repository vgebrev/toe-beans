import { describe, expect, it } from 'vitest';
import { deviceLabel, makerOf } from './browser.js';

const androidChrome =
	'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

describe('makerOf', () => {
	it.each([
		['SM-S711B', 'samsung'],
		['Galaxy S23 FE', 'samsung'],
		['22101316G', 'xiaomi'],
		['Redmi Note 12 Pro', 'xiaomi'],
		['POCO F5', 'xiaomi'],
		['Pixel 7', 'other'],
		[undefined, 'other']
	])('%s is %s', (model, maker) => {
		expect(makerOf(model)).toBe(maker);
	});
});

describe('deviceLabel', () => {
	it('names the model and browser', () => {
		expect(deviceLabel('SM-S711B', androidChrome)).toBe('SM-S711B · Chrome');
	});

	it('falls back to the platform when Chrome keeps the model to itself', () => {
		expect(deviceLabel(undefined, androidChrome)).toBe('Android phone · Chrome');
		expect(
			deviceLabel(
				'',
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
			)
		).toBe('Windows computer · Edge');
	});
});
