import { describe, expect, it } from 'vitest';
import type { PlainDate, PlainTime } from './calendar.js';
import {
	arePushKeys,
	careDueAt,
	careWhen,
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

describe('careDueAt (D30)', () => {
	const tz = 'Africa/Johannesburg';
	const task = (dueDate: string, dueTime?: string) => ({
		dueDate: dueDate as PlainDate,
		...(dueTime && { dueTime: dueTime as PlainTime })
	});
	const pref = (careLeadDays: 0 | 1 | 7, careTimeOfDay = '08:00') => ({
		careLeadDays,
		careTimeOfDay: careTimeOfDay as PlainTime
	});
	const iso = (d: Date) => d.toISOString();

	it('is the care time on the day, or the lead days before', () => {
		expect(iso(careDueAt(task('2026-11-12'), pref(0), tz))).toBe('2026-11-12T06:00:00.000Z');
		expect(iso(careDueAt(task('2026-11-12', '14:30'), pref(0), tz))).toBe(
			'2026-11-12T06:00:00.000Z'
		);
		expect(iso(careDueAt(task('2026-11-12', '14:30'), pref(1, '19:00'), tz))).toBe(
			'2026-11-11T17:00:00.000Z'
		);
	});

	it('is an hour before a timed task when that’s earlier than the care time', () => {
		expect(iso(careDueAt(task('2026-11-12', '07:30'), pref(0), tz))).toBe(
			'2026-11-12T04:30:00.000Z'
		);
		expect(iso(careDueAt(task('2026-11-12', '08:30'), pref(0), tz))).toBe(
			'2026-11-12T05:30:00.000Z'
		);
		expect(iso(careDueAt(task('2026-11-12', '09:00'), pref(0), tz))).toBe(
			'2026-11-12T06:00:00.000Z'
		);
	});

	it('falls back to the day, then an hour before, for a task changed after its time', () => {
		const t = task('2026-11-13', '15:00');
		expect(iso(careDueAt(t, pref(7), tz, new Date('2026-11-10T15:00:00Z')))).toBe(
			'2026-11-13T06:00:00.000Z'
		);
		expect(iso(careDueAt(t, pref(7), tz, new Date('2026-11-13T07:00:00Z')))).toBe(
			'2026-11-13T12:00:00.000Z'
		);
		// Nothing left to come: the planned time, which isDue then refuses as before the change.
		expect(iso(careDueAt(task('2026-11-13'), pref(0), tz, new Date('2026-11-13T07:00:00Z')))).toBe(
			'2026-11-13T06:00:00.000Z'
		);
	});
});

describe('careWhen', () => {
	const today = '2026-11-10' as PlainDate;
	it.each([
		['2026-11-10', undefined, 'today'],
		['2026-11-10', '14:30', 'today at 14:30'],
		['2026-11-11', undefined, 'tomorrow'],
		['2026-11-17', '09:00', 'Tue 17 Nov at 09:00'],
		['2026-11-08', undefined, 'Sun 8 Nov']
	])('%s %s is "%s"', (date, time, expected) => {
		expect(careWhen(date as PlainDate, time as PlainTime | undefined, today)).toBe(expected);
	});
});
