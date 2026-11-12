import { describe, expect, it } from 'vitest';
import {
	arePushKeys,
	cleanDeviceLabel,
	isAllowedEndpoint,
	isDue,
	PUSH_SERVICES,
	retryAt,
	trainingDueAt
} from './reminders.js';

const MIN = 60_000;

describe('isAllowedEndpoint', () => {
	it.each([
		'https://fcm.googleapis.com/fcm/send/abc:def',
		'https://updates.push.services.mozilla.com/wpush/v2/x',
		'https://wns2-db5p.notify.windows.com/w/?token=x',
		'https://web.push.apple.com/QGx'
	])('takes the browsers’ push services: %s', (url) => {
		expect(isAllowedEndpoint(url, PUSH_SERVICES)).toBe(true);
	});

	it.each([
		'http://fcm.googleapis.com/fcm/send/x',
		'https://fcm.googleapis.com.evil.example/x',
		'https://evilnotify.windows.com/x',
		'https://user:pw@fcm.googleapis.com/x',
		'http://169.254.169.254/computeMetadata/v1/',
		'http://localhost:3000/internal/tick',
		'not a url',
		`https://fcm.googleapis.com/${'x'.repeat(2100)}`
	])('refuses anything else, so the server never posts where a client says: %s', (url) => {
		expect(isAllowedEndpoint(url, PUSH_SERVICES)).toBe(false);
	});

	it('takes an extra origin a test adds', () => {
		expect(isAllowedEndpoint('http://localhost:4174/push/1', ['http://localhost:4174'])).toBe(true);
		expect(isAllowedEndpoint('http://localhost:4175/push/1', ['http://localhost:4174'])).toBe(
			false
		);
	});
});

describe('isDue', () => {
	const now = new Date('2026-11-10T15:00:00Z');
	const at = (min: number) => new Date(now.getTime() + min * MIN);
	const due = (min: number, changedMin = -600) =>
		isDue(at(min), { now, intervalMs: 5 * MIN, changedAt: at(changedMin) });

	it('takes what falls due before the next tick', () => {
		expect(due(0)).toBe(true);
		expect(due(4)).toBe(true);
		expect(due(5)).toBe(false);
	});

	it('makes up for missed ticks within half an hour', () => {
		expect(due(-30)).toBe(true);
		expect(due(-31)).toBe(false);
	});

	it("doesn't remind of what was set up after it fell due", () => {
		expect(due(-10, -11)).toBe(true);
		expect(due(-10, -9)).toBe(false);
	});
});

describe('the rest', () => {
	it('works out the lead time', () => {
		expect(trainingDueAt(new Date('2026-11-10T15:30:00Z'), 15)).toEqual(
			new Date('2026-11-10T15:15:00Z')
		);
	});

	it('backs off 1 then 4 minutes', () => {
		const now = new Date('2026-11-10T15:00:00Z');
		expect(retryAt(now, 1)).toEqual(new Date('2026-11-10T15:01:00Z'));
		expect(retryAt(now, 2)).toEqual(new Date('2026-11-10T15:04:00Z'));
	});

	it('checks key shapes', () => {
		expect(arePushKeys({ p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) })).toBe(true);
		expect(arePushKeys({ p256dh: 'B'.repeat(86), auth: 'a'.repeat(22) })).toBe(false);
		expect(arePushKeys({ p256dh: 'B'.repeat(87), auth: 'a+/'.padEnd(22, 'a') })).toBe(false);
	});

	it('tidies device labels', () => {
		expect(cleanDeviceLabel('  Galaxy S23 FE\n·  Chrome ')).toBe('Galaxy S23 FE · Chrome');
		expect(cleanDeviceLabel('')).toBe('This device');
		expect(cleanDeviceLabel(undefined)).toBe('This device');
		expect(cleanDeviceLabel('x'.repeat(100))).toHaveLength(60);
	});
});
