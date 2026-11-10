// A household's dog and its profile photo (architecture §5.2, FR-02). Every training session,
// event and care task belongs to one, so archiving replaces deleting: history keeps its dog.
import { validationError, type ValidationError } from './errors.js';
import type { Id } from './id.js';
import { cleanName, cleanText } from './name.js';
import { err, ok, type Result } from './result.js';

/** A calendar date with no time or zone, `YYYY-MM-DD`. */
export type PlainDate = string & { readonly __brand: 'PlainDate' };

/** `day` is a known date; `month` and `year` are estimates ("about 4 months", ui.md §5.4). */
export type DatePrecision = 'day' | 'month' | 'year';

export interface BirthDate {
	date: PlainDate;
	precision: DatePrecision;
}

/** The photo's objects are stored under its ID, so a new photo is a new ID (architecture §3.6). */
export interface ProfilePhoto {
	photoId: Id;
	updatedAt: Date;
}

export interface DogDetails {
	name: string;
	birth?: BirthDate;
	adoptionDate?: PlainDate;
	notes?: string;
}

export interface Dog extends DogDetails {
	id: Id;
	householdId: Id;
	/** Required: it's how everyone sees at a glance which dog an entry is for (ui.md J1). */
	photo: ProfilePhoto;
	/** An index into the accent palette (ui.md §5.5), picked when the dog is added. */
	accent: number;
	archivedAt?: Date;
	/** Starts at 1 and goes up by one on every write; the ETag (architecture §3.3). */
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export const DOG_NAME_MAX = 50;
export const DOG_NOTES_MAX = 2000;
export const ACCENT_COUNT = 6;
/** Earlier than any dog alive; mostly catches a mistyped year. */
const EARLIEST_DATE = '1990-01-01';
/** The furthest ahead of UTC any time zone is, so "today" anywhere is never in the future. */
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;

export function isPlainDate(value: string): value is PlainDate {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const [, y, m, d] = match.map(Number) as [number, number, number, number];
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The latest date that's today somewhere on Earth at `now`. */
export const latestToday = (now: Date): PlainDate =>
	new Date(now.getTime() + MAX_UTC_OFFSET_MS).toISOString().slice(0, 10) as PlainDate;

/** Notes on a dog: see `cleanText`. */
export const cleanNotes = (input: string): string | undefined | null =>
	cleanText(input, DOG_NOTES_MAX);

export interface DogDetailsInput {
	name: string;
	birth?: { date: string; precision: DatePrecision } | undefined;
	adoptionDate?: string | undefined;
	notes?: string | undefined;
}

/** Checks the details as a whole, so the field errors can say how they relate. */
export function cleanDogDetails(
	input: DogDetailsInput,
	now: Date
): Result<DogDetails, ValidationError> {
	const fields: Record<string, string[]> = {};
	const latest = latestToday(now);
	const name = cleanName(input.name, DOG_NAME_MAX);
	if (!name) fields.name = [`Enter a name of up to ${DOG_NAME_MAX} characters.`];

	const dateProblem = (date: string, what: string): string | null => {
		if (!isPlainDate(date)) return `Enter the ${what} as a date.`;
		if (date < EARLIEST_DATE) return `Check the year of the ${what}.`;
		if (date > latest) return `The ${what} can't be in the future.`;
		return null;
	};

	let birth: BirthDate | undefined;
	if (input.birth) {
		const problem = dateProblem(input.birth.date, 'birth date');
		if (problem) fields['birth.date'] = [problem];
		else birth = { date: input.birth.date as PlainDate, precision: input.birth.precision };
	}

	let adoptionDate: PlainDate | undefined;
	if (input.adoptionDate !== undefined) {
		const problem = dateProblem(input.adoptionDate, 'adoption date');
		if (problem) fields.adoptionDate = [problem];
		// An estimated birth date can be off, so only a known one rules an adoption date out.
		else if (birth?.precision === 'day' && input.adoptionDate < birth.date) {
			fields.adoptionDate = ["The adoption date can't be before the birth date."];
		} else adoptionDate = input.adoptionDate as PlainDate;
	}

	const notes = input.notes === undefined ? undefined : cleanNotes(input.notes);
	if (notes === null) fields.notes = [`Keep notes to ${DOG_NOTES_MAX} characters of text.`];

	if (!name || Object.keys(fields).length > 0) {
		return err(validationError('The dog is not valid.', fields));
	}
	return ok({
		name,
		...(birth && { birth }),
		...(adoptionDate && { adoptionDate }),
		...(notes && { notes })
	});
}

/** The accent used least among the household's dogs, the lowest on a tie (ui.md §5.5). */
export function pickAccent(inUse: readonly number[]): number {
	const counts = Array.from({ length: ACCENT_COUNT }, () => 0);
	for (const accent of inUse) if (accent >= 0 && accent < ACCENT_COUNT) counts[accent]!++;
	return counts.indexOf(Math.min(...counts));
}

export type PhotoSize = 'large' | 'thumb';

/** Pixels on a side: photos are square, cropped on the phone (ui.md J1, architecture §3.6). */
export const PHOTO_PIXELS: Record<PhotoSize, number> = { large: 1024, thumb: 256 };

/** Where a photo's objects are stored. Random IDs, so a key can't be guessed (§3.6). */
export const photoKey = (dog: Pick<Dog, 'householdId' | 'id'>, photoId: Id, size: PhotoSize) =>
	`households/${dog.householdId}/dogs/${dog.id}/${photoId}-${size}.webp`;
