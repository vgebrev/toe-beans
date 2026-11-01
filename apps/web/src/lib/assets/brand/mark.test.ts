import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markHeart, markLetters, markToes } from './mark.js';

const files = ['mark.svg', 'favicon.svg', 'maskable.svg', 'badge.svg'];

describe('brand SVG files', () => {
	it.each(files)('%s embeds the same mark geometry as mark.ts', (file) => {
		const svg = readFileSync(new URL(file, import.meta.url), 'utf8');
		expect(svg).toContain(`fill-rule="evenodd" d="${markLetters}"`);
		expect(svg).toContain(`d="${markHeart}"`);
		for (const { cx, cy, rx, ry, deg } of markToes) {
			expect(svg).toContain(
				`cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${deg} ${cx} ${cy})"`
			);
		}
	});

	it('badge.svg is a white silhouette on transparent, as Android requires', () => {
		const svg = readFileSync(new URL('badge.svg', import.meta.url), 'utf8');
		const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
		expect(new Set(fills)).toEqual(new Set(['#FFFFFF']));
		expect(svg).not.toContain('<rect');
	});
});
