// Per-device theme choice (ui.md §6.4): System (the default), Light or Dark, kept in
// localStorage and never synced to the account. The inline script in src/app.html applies a
// stored override before first paint; this module changes it at runtime. Keep the storage key
// and theme-color values in step with that script (theme.test.ts checks them).
import { tokens } from '#lib/theme/tokens.js';

export const THEME_STORAGE_KEY = 'toe-beans:theme';
export const themeChoices = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof themeChoices)[number];

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage, or undefined where it's blocked (some private modes throw on access). */
function defaultStorage(): Storage | undefined {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

/** The stored choice. Anything missing, unreadable or unknown means System. */
export function readThemeChoice(storage = defaultStorage()): ThemeChoice {
	try {
		const value = storage?.getItem(THEME_STORAGE_KEY);
		return value === 'light' || value === 'dark' ? value : 'system';
	} catch {
		return 'system';
	}
}

/** Stores the choice. Returns false if storage is unavailable: it then lasts until reload. */
export function saveThemeChoice(choice: ThemeChoice, storage = defaultStorage()): boolean {
	try {
		if (!storage) return false;
		if (choice === 'system') storage.removeItem(THEME_STORAGE_KEY);
		else storage.setItem(THEME_STORAGE_KEY, choice);
		return true;
	} catch {
		return false;
	}
}

/**
 * Applies the choice to the page: `data-theme` on <html> drives the CSS tokens (app.css), and
 * the theme-color metas tint Android's status bar. With System, each meta goes back to its
 * own media query.
 */
export function applyThemeChoice(choice: ThemeChoice, doc: Document = document): void {
	const root = doc.documentElement;
	if (choice === 'system') delete root.dataset.theme;
	else root.dataset.theme = choice;

	for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
		const scheme = choice === 'system' ? meta.dataset.scheme : choice;
		meta.content = scheme === 'dark' ? tokens.bg.dark : tokens.bg.light;
	}
}
