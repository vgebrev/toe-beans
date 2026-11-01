import type { ErrorEvent } from '@sentry/browser';
import { describe, expect, it } from 'vitest';
import { scrubBrowserEvent } from './sentry-scrub.js';

describe('scrubBrowserEvent', () => {
	it('keeps only the user agent from the request', () => {
		const event: ErrorEvent = {
			type: undefined,
			request: {
				url: 'https://toebeans.co.za/join/secret-token?x=1',
				query_string: 'x=1',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Linux; Android 15; SM-S711B)',
					Referer: 'https://toebeans.co.za/join/secret-token'
				}
			},
			user: { ip_address: '{{auto}}' },
			breadcrumbs: [{ category: 'navigation', data: { to: '/join/secret-token' } }],
			tags: { route: '/join/[token]' }
		};
		const scrubbed = scrubBrowserEvent(event);
		expect(scrubbed.request).toEqual({
			headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; SM-S711B)' }
		});
		expect(JSON.stringify(scrubbed)).not.toMatch(/secret-token|ip_address/);
		expect(scrubbed.tags).toEqual({ route: '/join/[token]' });
	});

	it('copes with an event that has no request', () => {
		expect(scrubBrowserEvent({ type: undefined, message: 'x' })).toEqual({
			type: undefined,
			message: 'x'
		});
	});
});
