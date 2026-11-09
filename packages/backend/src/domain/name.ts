// Names people type: a display name, a household's name.

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
