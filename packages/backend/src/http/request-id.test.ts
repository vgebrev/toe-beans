import { describe, expect, it } from 'vitest';
import { requestIdFrom } from './request-id.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('requestIdFrom', () => {
	it('keeps a well-formed upstream ID', () => {
		expect(requestIdFrom('8d4f2c1a9b3e7f60-JNB')).toBe('8d4f2c1a9b3e7f60-JNB');
	});

	it('generates a UUID when the header is missing', () => {
		expect(requestIdFrom(null)).toMatch(uuid);
		expect(requestIdFrom(undefined)).toMatch(uuid);
		expect(requestIdFrom('')).toMatch(uuid);
	});

	it('replaces IDs that are too short, too long or carry other characters', () => {
		for (const bad of [
			'short',
			'x'.repeat(129),
			'abc def ghi',
			'id\nINFO fake line',
			'{"a":1}xxxx'
		]) {
			expect(requestIdFrom(bad)).toMatch(uuid);
		}
	});
});
