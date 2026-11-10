// Text people type: a display name, a household's name, notes.

/**
 * Surrounding and repeated whitespace removed, 1 to `max` characters, no control characters. Emoji
 * are fine. Null when it isn't acceptable.
 */
export function cleanName(input: string, max: number): string | null {
	const name = input.normalize('NFC').trim().replace(/\s+/g, ' ');
	if (name.length === 0 || [...name].length > max) return null;
	// Control characters, and the bidi controls that can make a name display as another.
	if (/[\p{Cc}‪-‮⁦-⁩]/u.test(name)) return null;
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
	// As for names: control characters, and the bidi controls that can make text display as other text.
	if (/[\p{Cc}‪-‮⁦-⁩]/u.test(text.replace(/[\n\t]/g, ''))) return null;
	return text;
}
