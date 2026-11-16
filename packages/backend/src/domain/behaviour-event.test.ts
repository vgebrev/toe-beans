import { describe, expect, it } from 'vitest';
import { cleanEventDetails, type EventDetails } from './behaviour-event.js';

const now = new Date('2026-11-10T15:00:00Z');
const existing: EventDetails = {
	category: 'barking',
	occurredAt: now,
	trigger: 'Delivery van',
	response: 'Barked, then settled',
	notes: 'n'
};

describe('cleanEventDetails', () => {
	it('needs a category for a new event, and defaults to now', () => {
		expect(cleanEventDetails({}, { occurredAt: now }, now)).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The event is not valid.',
				fields: { category: ['Choose what happened.'] }
			}
		});
		expect(cleanEventDetails({ category: 'visitor' }, { occurredAt: now }, now)).toEqual({
			ok: true,
			value: { category: 'visitor', occurredAt: now }
		});
	});

	it('takes every detail, tidying the text', () => {
		expect(
			cleanEventDetails(
				{
					category: 'cat_interaction',
					occurredAt: '2026-11-10T14:30:00Z',
					trigger: '  Cat on the wall ',
					response: 'Stared,\r\nthen looked at me',
					notes: 'Rewarded the look'
				},
				{ occurredAt: now },
				now
			)
		).toEqual({
			ok: true,
			value: {
				category: 'cat_interaction',
				occurredAt: new Date('2026-11-10T14:30:00Z'),
				trigger: 'Cat on the wall',
				response: 'Stared,\nthen looked at me',
				notes: 'Rewarded the look'
			}
		});
	});

	it('keeps what an edit leaves out, and clears text on null or blank', () => {
		expect(cleanEventDetails({ category: 'fear' }, existing, now)).toEqual({
			ok: true,
			value: { ...existing, category: 'fear' }
		});
		expect(cleanEventDetails({ trigger: null, notes: '   ' }, existing, now)).toEqual({
			ok: true,
			value: { category: 'barking', occurredAt: now, response: 'Barked, then settled' }
		});
	});

	it('refuses an unknown category, a time ahead or over a year back, and long text', () => {
		const result = cleanEventDetails(
			{
				category: 'zoomies',
				occurredAt: '2026-11-10T15:06:00Z',
				trigger: 'x'.repeat(201),
				response: 'x'.repeat(1001),
				notes: 'x'.repeat(2001)
			},
			existing,
			now
		);
		expect(result).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The event is not valid.',
				fields: {
					category: ['Choose what happened.'],
					occurredAt: ["Choose a time that's already happened."],
					trigger: ['Keep this to 200 characters of text.'],
					response: ['Keep this to 1000 characters of text.'],
					notes: ['Keep this to 2000 characters of text.']
				}
			}
		});
		expect(cleanEventDetails({ occurredAt: '2025-11-08T15:00:00Z' }, existing, now)).toMatchObject({
			error: { fields: { occurredAt: ['Choose a time within the last year.'] } }
		});
		expect(cleanEventDetails({ occurredAt: 'yesterday' }, existing, now)).toMatchObject({
			error: { fields: { occurredAt: ['Choose when it happened.'] } }
		});
		// A phone a few minutes ahead of the server is fine.
		expect(cleanEventDetails({ occurredAt: '2026-11-10T15:04:00Z' }, existing, now).ok).toBe(true);
	});
});
