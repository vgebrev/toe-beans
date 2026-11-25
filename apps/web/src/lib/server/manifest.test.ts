import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { webManifest } from './manifest.js';

const exists = (src: string) => {
	readFileSync(new URL(`../../../static${src}`, import.meta.url));
	return true;
};

describe('webManifest', () => {
	it('is plain Toe Beans on prod, with the brand icons', () => {
		const manifest = webManifest('prod');
		expect([manifest.name, manifest.short_name]).toEqual(['Toe Beans', 'Toe Beans']);
		expect(manifest.icons.map((i) => i.src)).toEqual([
			'/icons/icon-192.png',
			'/icons/icon-512.png',
			'/icons/maskable-192.png',
			'/icons/maskable-512.png'
		]);
	});

	it('says Test off prod, with the TEST icons, so both can sit on one phone', () => {
		const manifest = webManifest('local');
		expect([manifest.name, manifest.short_name]).toEqual(['Toe Beans (Test)', 'Toe Beans (Test)']);
		expect(manifest.icons.every((i) => i.src.startsWith('/icons/test-'))).toBe(true);
		expect(manifest.icons.map((i) => i.purpose)).toEqual(['any', 'any', 'maskable', 'maskable']);
	});

	it('opens on the app, never on the landing page the edge serves at a bare / (D44)', () => {
		for (const env of ['prod', 'local'] as const) {
			const manifest = webManifest(env);
			expect(manifest.id).toBe('/');
			expect(new URL(manifest.start_url, 'https://toebeans.co.za').search).not.toBe('');
			expect(manifest.shortcuts.every((s) => s.url.includes('?'))).toBe(true);
		}
	});

	it('points only at icons that exist', () => {
		for (const env of ['prod', 'local'] as const) {
			const manifest = webManifest(env);
			const srcs = [...manifest.icons, ...manifest.shortcuts.flatMap((s) => s.icons)].map(
				(i) => i.src
			);
			expect(srcs.every(exists)).toBe(true);
		}
	});
});
