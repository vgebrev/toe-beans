import { describe, expect, it } from 'vitest';
import { cleanLogDetails, type LogDetails } from './session-log.js';

const now = new Date('2026-11-10T15:00:00Z');
const base: LogDetails = { practisedAt: now, outcome: 'not_assessed' };

describe('cleanLogDetails', () => {
	it('keeps the defaults when nothing is said: logging never claims success', () => {
		expect(cleanLogDetails({}, base, now)).toEqual({ ok: true, value: base });
	});

	it('takes every detail, tidying the text', () => {
		const result = cleanLogDetails(
			{
				practisedAt: '2026-11-10T14:30:00Z',
				outcome: 'partial',
				durationMin: 5,
				emotionalState: 'relaxed',
				environment: 'garden',
				environmentNote: '  by the lemon tree ',
				notes: 'Came back\r\nfirst time.'
			},
			base,
			now
		);
		expect(result).toEqual({
			ok: true,
			value: {
				practisedAt: new Date('2026-11-10T14:30:00Z'),
				outcome: 'partial',
				durationMin: 5,
				emotionalState: 'relaxed',
				environment: 'garden',
				environmentNote: 'by the lemon tree',
				notes: 'Came back\nfirst time.'
			}
		});
	});

	it('clears a detail on null or blank text, and the place note with the place', () => {
		const full: LogDetails = {
			...base,
			durationMin: 5,
			emotionalState: 'stressed',
			environment: 'other',
			environmentNote: 'Vet',
			notes: 'n'
		};
		expect(
			cleanLogDetails(
				{ durationMin: null, emotionalState: null, environment: null, notes: '  ' },
				full,
				now
			)
		).toEqual({ ok: true, value: base });
	});

	it('refuses values outside the lists and out-of-range minutes', () => {
		const result = cleanLogDetails(
			{
				outcome: 'great',
				durationMin: 0,
				emotionalState: 'happy',
				environment: 'beach',
				notes: 'x'.repeat(2001)
			},
			base,
			now
		);
		expect(result).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The log is not valid.',
				fields: {
					outcome: ['Choose how it went, or Not assessed.'],
					durationMin: ['Give the minutes, from 1 to 240.'],
					emotionalState: ['Choose one of the moods.'],
					environment: ['Choose one of the places.'],
					notes: ['Keep this to 2000 characters of text.']
				}
			}
		});
		expect(cleanLogDetails({ durationMin: 2.5 }, base, now).ok).toBe(false);
		expect(cleanLogDetails({ durationMin: 241 }, base, now).ok).toBe(false);
	});

	it('allows a few minutes of clock skew, but not a practice in the future or over a year ago', () => {
		expect(cleanLogDetails({ practisedAt: '2026-11-10T15:04:00Z' }, base, now).ok).toBe(true);
		expect(cleanLogDetails({ practisedAt: '2026-11-10T15:10:00Z' }, base, now)).toMatchObject({
			ok: false,
			error: { fields: { practisedAt: ["Choose a time that's already happened."] } }
		});
		expect(cleanLogDetails({ practisedAt: '2025-11-01T00:00:00Z' }, base, now)).toMatchObject({
			ok: false,
			error: { fields: { practisedAt: ['Choose a time within the last year.'] } }
		});
		expect(cleanLogDetails({ practisedAt: 'yesterday' }, base, now)).toMatchObject({
			ok: false,
			error: { fields: { practisedAt: ['Choose when you practised.'] } }
		});
	});

	it('needs a place before a note about it', () => {
		expect(cleanLogDetails({ environmentNote: 'Park' }, base, now)).toMatchObject({
			ok: false,
			error: { fields: { environmentNote: ['Choose a place first.'] } }
		});
	});
});
