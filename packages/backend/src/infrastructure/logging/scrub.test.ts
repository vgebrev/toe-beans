import { describe, expect, it } from 'vitest';
import { scrubText } from './scrub.js';

describe('scrubText', () => {
	it('masks the value in a Mongo duplicate-key error', () => {
		expect(
			scrubText(
				'E11000 duplicate key error collection: tb.users index: email_1 dup key: { email: "jo@example.com" }'
			)
		).toBe('E11000 duplicate key error collection: tb.users index: email_1 dup key: [redacted]');
	});

	it('masks it inside a stack trace too', () => {
		expect(scrubText('Error: dup key: { name: "Ripley" }\n    at insert (x.ts:1:1)')).toBe(
			'Error: dup key: [redacted]\n    at insert (x.ts:1:1)'
		);
	});

	it('masks emails, connection strings and bearer tokens', () => {
		expect(scrubText('invite for jo.b+1@mail.example.co.za failed')).toBe(
			'invite for [email] failed'
		);
		expect(scrubText('connect mongodb+srv://app:pw@c.example.net/x failed')).toBe(
			'connect mongodb://[redacted] failed'
		);
		expect(scrubText('sent Bearer eyJhbGciOi.abc-def_1 upstream')).toBe(
			'sent Bearer [redacted] upstream'
		);
	});

	it('leaves ordinary text alone', () => {
		expect(scrubText('Recall basics at 17:30 for dog 0192f3a4')).toBe(
			'Recall basics at 17:30 for dog 0192f3a4'
		);
	});
});
