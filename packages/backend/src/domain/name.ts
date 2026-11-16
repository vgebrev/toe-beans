// Text people type: a display name, a household's name, notes.

/** Control characters, and the bidi controls that can make text display as other text. */
const UNSAFE = /[\p{Cc}‪-‮⁦-⁩]/u;

/**
 * Surrounding and repeated whitespace removed, 1 to `max` characters, no control characters. Emoji
 * are fine. Null when it isn't acceptable.
 */
export function cleanName(input: string, max: number): string | null {
	const name = input.normalize('NFC').trim().replace(/\s+/g, ' ');
	if (name.length === 0 || [...name].length > max) return null;
	if (UNSAFE.test(name)) return null;
	return name;
}

/**
 * Trimmed, with Windows line ends made plain, 1 to `max` characters. Newlines and tabs are fine;
 * other control characters aren't. Undefined when blank, null when not acceptable.
 */
export function cleanText(input: string, max: number): string | undefined | null {
	const text = input.normalize('NFC').replace(/\r\n?/g, '\n').trim();
	if (text.length === 0) return undefined;
	if ([...text].length > max) return null;
	if (UNSAFE.test(text.replace(/[\n\t]/g, ''))) return null;
	return text;
}

/**
 * Applies optional text from an update to `target[key]`: undefined leaves it as it was, null or
 * blank clears it, and text that `cleanText` refuses adds a field error under `key`.
 */
export function patchText<K extends string>(
	target: Partial<Record<K, string>>,
	fields: Record<string, string[]>,
	key: K,
	given: string | null | undefined,
	max: number
): void {
	if (given === undefined) return;
	const cleaned = given === null ? undefined : cleanText(given, max);
	if (cleaned === null) fields[key] = [`Keep this to ${max} characters of text.`];
	else if (cleaned === undefined) delete target[key];
	else target[key] = cleaned;
}
