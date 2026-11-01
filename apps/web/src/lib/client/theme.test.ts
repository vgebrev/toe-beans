import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokens } from '#lib/theme/tokens.js';
import {
	THEME_STORAGE_KEY,
	applyThemeChoice,
	readThemeChoice,
	saveThemeChoice,
	type ThemeChoice
} from './theme.js';

function memoryStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key)
	};
}

const blocked = {
	getItem: () => {
		throw new Error('SecurityError');
	},
	setItem: () => {
		throw new Error('SecurityError');
	},
	removeItem: () => {
		throw new Error('SecurityError');
	}
};

describe('readThemeChoice', () => {
	it('returns a stored override', () => {
		expect(readThemeChoice(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
	});

	it('falls back to system when missing, unknown or blocked', () => {
		expect(readThemeChoice(memoryStorage())).toBe('system');
		expect(readThemeChoice(memoryStorage({ [THEME_STORAGE_KEY]: 'sepia' }))).toBe('system');
		expect(readThemeChoice(blocked)).toBe('system');
		expect(readThemeChoice(undefined)).toBe('system');
	});
});

describe('saveThemeChoice', () => {
	it('stores an override and clears it for system', () => {
		const storage = memoryStorage();
		expect(saveThemeChoice('light', storage)).toBe(true);
		expect(storage.data.get(THEME_STORAGE_KEY)).toBe('light');
		expect(saveThemeChoice('system', storage)).toBe(true);
		expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
	});

	it('reports blocked storage instead of throwing', () => {
		expect(saveThemeChoice('dark', blocked)).toBe(false);
		expect(saveThemeChoice('dark', undefined)).toBe(false);
	});
});

describe('applyThemeChoice', () => {
	function fakeDocument() {
		const metas = [
			{ dataset: { scheme: 'light' }, content: tokens.bg.light },
			{ dataset: { scheme: 'dark' }, content: tokens.bg.dark }
		];
		const root = { dataset: {} as Record<string, string> };
		const doc = { documentElement: root, querySelectorAll: () => metas };
		return { doc: doc as unknown as Document, root, metas };
	}

	it.each<[ThemeChoice, string | undefined, string[]]>([
		['dark', 'dark', [tokens.bg.dark, tokens.bg.dark]],
		['light', 'light', [tokens.bg.light, tokens.bg.light]],
		['system', undefined, [tokens.bg.light, tokens.bg.dark]]
	])('%s sets data-theme %s and the theme-color metas', (choice, attribute, colours) => {
		const { doc, root, metas } = fakeDocument();
		applyThemeChoice('dark', doc);
		applyThemeChoice(choice, doc);
		expect(root.dataset.theme).toBe(attribute);
		expect(metas.map((meta) => meta.content)).toEqual(colours);
	});
});

describe('the pre-paint script in app.html', () => {
	const html = readFileSync(new URL('../../app.html', import.meta.url), 'utf8');

	it('uses the same storage key and theme colours as this module', () => {
		expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
		expect(html).toContain(`theme === 'dark' ? '${tokens.bg.dark}' : '${tokens.bg.light}'`);
		expect(html).toContain(`content="${tokens.bg.light}"`);
		expect(html).toContain(`content="${tokens.bg.dark}"`);
	});
});
