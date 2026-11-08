import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastPairs, contrastRatio, tokens, type Scheme, type TokenName } from './tokens.js';

const schemes: Scheme[] = ['light', 'dark'];
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('contrastRatio', () => {
	it('matches the WCAG reference values', () => {
		expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
		expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
		expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
	});

	it('rejects anything but #RRGGBB', () => {
		expect(() => contrastRatio('#FFF', '#000000')).toThrow('Not a #RRGGBB colour');
	});
});

describe('brand tokens (ui.md §6.4, WCAG 2.2 AA)', () => {
	const cases = schemes.flatMap((scheme) => contrastPairs.map((pair) => ({ scheme, ...pair })));

	it.each(cases)('$scheme: $fg on $bg is at least $min:1', ({ scheme, fg, bg, min }) => {
		expect(contrastRatio(tokens[fg][scheme], tokens[bg][scheme])).toBeGreaterThanOrEqual(min);
	});

	it('declares every token in app.css with the same values', () => {
		const declared = new Map(
			[
				...appCss.matchAll(/--tb-([a-z0-9-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)
			].map(([, name, light, dark]) => [
				name,
				{ light: light!.toUpperCase(), dark: dark!.toUpperCase() }
			])
		);
		const expected = new Map(
			(Object.keys(tokens) as TokenName[]).map((name) => [
				name,
				{ light: tokens[name].light, dark: tokens[name].dark }
			])
		);
		expect(declared).toEqual(expected);
	});
});
