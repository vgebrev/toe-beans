import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { scrubEvent } from './sentry.js';

describe('scrubEvent', () => {
	it('drops request, user and breadcrumbs and masks exception text', () => {
		const event: ErrorEvent = {
			type: undefined,
			message: 'failed for jo@example.com',
			request: { url: 'https://toebeans.co.za/join/secret-token', cookies: { sid: 'abc' } },
			user: { email: 'jo@example.com' },
			breadcrumbs: [{ message: 'GET /join/secret-token' }],
			exception: {
				values: [{ type: 'MongoServerError', value: 'dup key: { email: "jo@example.com" }' }]
			},
			tags: { route: '/join/[token]' }
		};
		const scrubbed = scrubEvent(event);
		expect(JSON.stringify(scrubbed)).not.toMatch(/jo@example|secret-token|abc/);
		expect(scrubbed.tags).toEqual({ route: '/join/[token]' });
		expect(scrubbed.exception?.values?.[0]?.value).toBe('dup key: [redacted]');
	});
});
