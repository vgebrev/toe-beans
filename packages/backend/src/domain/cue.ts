// The household's shared cue dictionary (architecture §5.2, FR-04): the words, hand signals and
// reward conventions everyone agrees on, so a puppy hears the same thing from each caregiver.
import { validationError, type ValidationError } from './errors.js';
import type { Id } from './id.js';
import { cleanName, cleanText } from './name.js';
import { err, ok, type Result } from './result.js';

export interface CueDetails {
	/** The spoken word or phrase, e.g. "Sit" or "Let's go". */
	label: string;
	/** What the dog does on the cue, and when it's done. */
	meaning: string;
	handSignal?: string;
	rewardConvention?: string;
	notes?: string;
}

export interface Cue extends CueDetails {
	id: Id;
	householdId: Id;
	/** Who saved it last, for "Last edited by Sam" (ui.md §4.6). */
	updatedBy: Id;
	/** Starts at 1 and goes up by one on every write; the ETag (architecture §3.3). */
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export const CUE_LABEL_MAX = 50;
/** For the meaning, hand signal and reward convention: a sentence or two each. */
export const CUE_TEXT_MAX = 500;
export const CUE_NOTES_MAX = 2000;
/** Far more than a household agrees on; it keeps one household from filling the database. */
export const CUES_MAX = 200;

export interface CueDetailsInput {
	label: string;
	meaning: string;
	handSignal?: string | undefined;
	rewardConvention?: string | undefined;
	notes?: string | undefined;
}

/** How labels are compared, so "Sit" and "sit " are the same cue. */
export const labelKey = (label: string): string =>
	label.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

export function cleanCueDetails(input: CueDetailsInput): Result<CueDetails, ValidationError> {
	const fields: Record<string, string[]> = {};
	const label = cleanName(input.label, CUE_LABEL_MAX);
	if (!label) fields.label = [`Enter the cue word, up to ${CUE_LABEL_MAX} characters.`];

	const meaning = cleanText(input.meaning, CUE_TEXT_MAX);
	if (meaning === undefined) fields.meaning = ['Say what your dog does on this cue.'];
	else if (meaning === null) fields.meaning = [`Keep this to ${CUE_TEXT_MAX} characters of text.`];

	const optional = (key: 'handSignal' | 'rewardConvention' | 'notes', max: number) => {
		const given = input[key];
		const text = given === undefined ? undefined : cleanText(given, max);
		if (text === null) fields[key] = [`Keep this to ${max} characters of text.`];
		return text ?? undefined;
	};
	const handSignal = optional('handSignal', CUE_TEXT_MAX);
	const rewardConvention = optional('rewardConvention', CUE_TEXT_MAX);
	const notes = optional('notes', CUE_NOTES_MAX);

	if (!label || !meaning || Object.keys(fields).length > 0) {
		return err(validationError('The cue is not valid.', fields));
	}
	return ok({
		label,
		meaning,
		...(handSignal && { handSignal }),
		...(rewardConvention && { rewardConvention }),
		...(notes && { notes })
	});
}

/** A field error when another of the household's cues already has this label. */
export function duplicateLabel(
	label: string,
	others: readonly Pick<Cue, 'id' | 'label'>[],
	self?: Id
): Record<string, string[]> | null {
	const key = labelKey(label);
	const clash = others.find((c) => c.id !== self && labelKey(c.label) === key);
	return clash ? { label: [`There's already a cue called “${clash.label}”.`] } : null;
}
