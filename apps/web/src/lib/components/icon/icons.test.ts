import { describe, expect, it } from 'vitest';
import { icons } from './icons.js';
import { svgAttributes } from './svg.js';

describe('icons', () => {
	it('maps every name to drawable SVG elements', () => {
		for (const [name, elements] of Object.entries(icons)) {
			expect(elements.length, name).toBeGreaterThan(0);
			for (const [tag] of elements)
				expect(
					['path', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon'],
					`${name}: ${tag}`
				).toContain(tag);
		}
	});

	it('draws in currentColor, so icons take the text colour', () => {
		for (const [name, elements] of Object.entries(icons)) {
			for (const [, attributes] of elements) {
				for (const paint of ['stroke', 'fill'] as const) {
					const value = attributes[paint];
					if (value !== undefined && value !== 'none') expect(value, name).toBe('currentColor');
				}
			}
		}
	});
});

describe('svgAttributes', () => {
	it('converts to SVG attribute names and drops the React key', () => {
		expect(
			svgAttributes({ d: 'M0 0', strokeWidth: '1.5', strokeLinecap: 'round', key: '0' }, 1.5)
		).toEqual({ d: 'M0 0', 'stroke-width': 1.5, 'stroke-linecap': 'round' });
	});

	it('scales every stroke in proportion', () => {
		expect(svgAttributes({ strokeWidth: '1.5' }, 2)).toEqual({ 'stroke-width': 2 });
		expect(svgAttributes({ strokeWidth: '3' }, 2)).toEqual({ 'stroke-width': 4 });
	});
});
