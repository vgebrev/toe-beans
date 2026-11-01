// Brand colour tokens (ui.md §6.4): Beagle (light) and German Shepherd (dark).
//
// This is the source of truth. `src/app.css` declares each token as `--tb-<name>:
// light-dark(<light>, <dark>)`, and `tokens.test.ts` fails if the two drift apart or if any
// pairing below drops under its WCAG 2.x minimum. Change a colour here and in app.css together.

export const tokens = {
	/** Page background. */
	bg: { light: '#FFFBF5', dark: '#141110' },
	/** Cards, sheets, the bottom bar. */
	surface: { light: '#FFFFFF', dark: '#211C18' },
	/** Tinted fills: the active tab pill, hover and pressed states, secondary buttons. */
	soft: { light: '#F6EBDD', dark: '#2C2520' },
	text: { light: '#2B1D14', dark: '#F3EADF' },
	'text-muted': { light: '#6B5444', dark: '#B5A493' },
	/** Buttons, links, the active tab, focus rings. */
	primary: { light: '#8A4B1F', dark: '#C98A4B' },
	'on-primary': { light: '#FFFFFF', dark: '#1A110A' },
	/** Decorative only (illustrations, highlights): never text or essential UI. */
	accent: { light: '#C98A4B', dark: '#C98A4B' },
	/** Decorative dividers and card outlines. */
	border: { light: '#E6D8C6', dark: '#3A312A' },
	/** Form control outlines: these identify the control, so they need 3:1 (WCAG 1.4.11). */
	input: { light: '#94806F', dark: '#857465' },
	/** Destructive actions only (ui.md §5.3). */
	danger: { light: '#B3261E', dark: '#F2867D' },
	'on-danger': { light: '#FFFFFF', dark: '#1A110A' },
	/** Attention text, such as the Overdue heading. Never used for outcomes. */
	warn: { light: '#8A5A00', dark: '#F2C46B' },
	// Outcome badges (ui.md §6.4): practice is not performance, so "Not yet" is blue, never red.
	'success-bg': { light: '#E3F2E6', dark: '#1D3324' },
	'success-fg': { light: '#1E5B2E', dark: '#8FD3A0' },
	'partial-bg': { light: '#FCEFD6', dark: '#3A2E14' },
	'partial-fg': { light: '#6E4A00', dark: '#F2C46B' },
	'not-yet-bg': { light: '#E4EEF8', dark: '#1B2A3A' },
	'not-yet-fg': { light: '#1F4E79', dark: '#9CC4EC' },
	/** The outlined, neutral "Not assessed" badge. Its label uses text-muted. */
	'not-assessed-border': { light: '#CDBFAE', dark: '#5A4D42' }
} as const satisfies Record<string, { light: string; dark: string }>;

export type TokenName = keyof typeof tokens;
export type Scheme = 'light' | 'dark';

/** WCAG 2.x: 4.5 for text, 3 for UI component boundaries and focus indicators. */
export const TEXT = 4.5;
export const NON_TEXT = 3;

/** Foreground/background pairs the UI actually uses, with the minimum each must meet. */
export const contrastPairs: readonly { fg: TokenName; bg: TokenName; min: number }[] = [
	...(['text', 'text-muted', 'primary'] as const).flatMap((fg) =>
		(['bg', 'surface', 'soft'] as const).map((bg) => ({ fg, bg, min: TEXT }))
	),
	{ fg: 'on-primary', bg: 'primary', min: TEXT },
	{ fg: 'danger', bg: 'bg', min: TEXT },
	{ fg: 'danger', bg: 'surface', min: TEXT },
	{ fg: 'on-danger', bg: 'danger', min: TEXT },
	{ fg: 'warn', bg: 'bg', min: TEXT },
	{ fg: 'warn', bg: 'surface', min: TEXT },
	{ fg: 'success-fg', bg: 'success-bg', min: TEXT },
	{ fg: 'partial-fg', bg: 'partial-bg', min: TEXT },
	{ fg: 'not-yet-fg', bg: 'not-yet-bg', min: TEXT },
	{ fg: 'input', bg: 'bg', min: NON_TEXT },
	{ fg: 'input', bg: 'surface', min: NON_TEXT },
	// The focus ring is drawn in primary.
	{ fg: 'primary', bg: 'bg', min: NON_TEXT }
];

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
	if (!match) throw new Error(`Not a #RRGGBB colour: ${hex}`);
	const [r, g, b] = match.slice(1).map((part) => {
		const c = parseInt(part, 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
}
