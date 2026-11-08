import { describe, expect, it } from 'vitest';
import type { Id } from './id.js';
import {
	ACCENT_COUNT,
	cleanDogDetails,
	cleanNotes,
	isPlainDate,
	latestToday,
	photoKey,
	pickAccent
} from './dog.js';

const now = new Date('2026-11-08T08:00:00Z');

describe('isPlainDate', () => {
	it('takes real calendar dates only', () => {
		expect(isPlainDate('2026-02-28')).toBe(true);
		expect(isPlainDate('2024-02-29')).toBe(true);
		expect(isPlainDate('2026-02-29')).toBe(false);
		expect(isPlainDate('2026-13-01')).toBe(false);
		expect(isPlainDate('2026-1-01')).toBe(false);
		expect(isPlainDate('2026-01-01T00:00:00Z')).toBe(false);
	});
});

describe('latestToday', () => {
	it("is the date somewhere already in tomorrow, so no time zone's today is refused", () => {
		expect(latestToday(new Date('2026-11-08T09:59:00Z'))).toBe('2026-11-08');
		expect(latestToday(new Date('2026-11-08T10:00:00Z'))).toBe('2026-11-09');
	});
});

describe('cleanNotes', () => {
	it('keeps line breaks, trims, and treats blank as none', () => {
		expect(cleanNotes('  Loves cheese.\r\nScared of the hoover.  ')).toBe(
			'Loves cheese.\nScared of the hoover.'
		);
		expect(cleanNotes(' \n ')).toBeUndefined();
	});

	it('refuses control characters and anything too long', () => {
		expect(cleanNotes('a\u0007b')).toBeNull();
		expect(cleanNotes('a‮b')).toBeNull();
		expect(cleanNotes('x'.repeat(2001))).toBeNull();
		expect(cleanNotes('🐶'.repeat(2000))).toBe('🐶'.repeat(2000));
	});
});

describe('cleanDogDetails', () => {
	it('tidies the name and keeps only what was given', () => {
		expect(cleanDogDetails({ name: '  Rosie  ' }, now)).toEqual({
			ok: true,
			value: { name: 'Rosie' }
		});
		expect(
			cleanDogDetails(
				{
					name: 'Rosie',
					birth: { date: '2026-06-01', precision: 'month' },
					adoptionDate: '2026-08-15',
					notes: 'Loves cheese.'
				},
				now
			)
		).toEqual({
			ok: true,
			value: {
				name: 'Rosie',
				birth: { date: '2026-06-01', precision: 'month' },
				adoptionDate: '2026-08-15',
				notes: 'Loves cheese.'
			}
		});
	});

	it('says what is wrong with each field', () => {
		const result = cleanDogDetails(
			{
				name: ' ',
				birth: { date: '2026-12-01', precision: 'day' },
				adoptionDate: '1989-12-31',
				notes: 'x'.repeat(2001)
			},
			now
		);
		expect(result).toEqual({
			ok: false,
			error: {
				kind: 'validation',
				message: 'The dog is not valid.',
				fields: {
					name: ['Enter a name of up to 50 characters.'],
					'birth.date': ["The birth date can't be in the future."],
					adoptionDate: ['Check the year of the adoption date.'],
					notes: ['Keep notes to 2000 characters of text.']
				}
			}
		});
		expect(cleanDogDetails({ name: 'R', adoptionDate: '2026-02-30' }, now)).toMatchObject({
			error: { fields: { adoptionDate: ['Enter the adoption date as a date.'] } }
		});
	});

	it('refuses an adoption before a known birth, but not before an estimated one', () => {
		const adopted = { name: 'Rosie', adoptionDate: '2026-05-01' };
		expect(
			cleanDogDetails({ ...adopted, birth: { date: '2026-06-01', precision: 'day' } }, now)
		).toMatchObject({
			error: { fields: { adoptionDate: ["The adoption date can't be before the birth date."] } }
		});
		expect(
			cleanDogDetails({ ...adopted, birth: { date: '2026-06-01', precision: 'month' } }, now)
		).toMatchObject({ ok: true });
	});
});

describe('pickAccent', () => {
	it('picks the least used, lowest first', () => {
		expect(pickAccent([])).toBe(0);
		expect(pickAccent([0, 1])).toBe(2);
		expect(pickAccent([1])).toBe(0);
		expect(pickAccent(Array.from({ length: ACCENT_COUNT }, (_, i) => i))).toBe(0);
		expect(pickAccent([0, 0, 1, 2, 3, 4, 5])).toBe(1);
	});
});

describe('photoKey', () => {
	it('files the photo under its household and dog', () => {
		const dog = { householdId: 'h1' as Id, id: 'd1' as Id };
		expect(photoKey(dog, 'p1' as Id, 'thumb')).toBe('households/h1/dogs/d1/p1-thumb.webp');
	});
});
