import { describe, expect, it } from 'vitest';
import { notificationOptions, readPayload, receiptUrl, targetUrl } from './notification.js';

const payload = {
	reminderId: 'r1',
	kind: 'training',
	title: 'Training time: Recall basics',
	body: 'Ripley · 17:30',
	path: 'sessions/s1',
	tag: 'session-s1'
};
const scope = 'https://toebeans.co.za/';

describe('push handling', () => {
	it('reads the server’s payload, and nothing else', () => {
		expect(readPayload(JSON.stringify(payload))).toEqual(payload);
		expect(readPayload(undefined)).toBeNull();
		expect(readPayload('not json')).toBeNull();
		expect(readPayload(JSON.stringify({ ...payload, path: 5 }))).toBeNull();
	});

	it('opens paths inside the app only', () => {
		expect(targetUrl('sessions/s1', scope)).toBe('https://toebeans.co.za/sessions/s1');
		expect(targetUrl('settings/notifications?test=arrived', scope)).toBe(
			'https://toebeans.co.za/settings/notifications?test=arrived'
		);
		expect(targetUrl('https://evil.example/x', scope)).toBe(scope);
		expect(targetUrl('//evil.example/x', scope)).toBe(scope);
		expect(targetUrl('../../x', 'https://toebeans.co.za/app/')).toBe('https://toebeans.co.za/app/');
	});

	it('reports arrival to the API', () => {
		expect(receiptUrl('r1', scope)).toBe('https://toebeans.co.za/api/v1/reminders/r1/received');
	});

	it('shows the body and replaces an earlier one for the same session', () => {
		expect(
			notificationOptions(readPayload(JSON.stringify(payload))!, { icon: 'i', badge: 'b' })
		).toEqual({
			body: 'Ripley · 17:30',
			icon: 'i',
			badge: 'b',
			tag: 'session-s1',
			renotify: true,
			data: { path: 'sessions/s1', reminderId: 'r1' }
		});
	});
});
