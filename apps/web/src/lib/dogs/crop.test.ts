import { describe, expect, it } from 'vitest';
import { clampFrame, initialFrame, MAX_ZOOM, panBy, sourceRect, zoomTo } from './crop.js';

const landscape = { width: 4000, height: 3000 };
const side = 300;

describe('crop frame', () => {
	it('starts centred, with the short side filling the square', () => {
		const frame = initialFrame(landscape, side);
		expect(frame.scale).toBeCloseTo(0.1);
		expect(frame.x).toBeCloseTo(-50);
		expect(frame.y).toBe(0);
		const shown = sourceRect(frame, side);
		expect(shown.x).toBeCloseTo(500);
		expect(shown.y).toBeCloseTo(0);
		expect(shown.size).toBeCloseTo(3000);
	});

	it('pans only as far as an edge', () => {
		const frame = initialFrame(landscape, side);
		expect(panBy(frame, 500, 500, landscape, side)).toMatchObject({ x: 0, y: 0 });
		expect(panBy(frame, -500, 0, landscape, side).x).toBeCloseTo(-100);
	});

	it('zooms between covering and 4×, around the pinch', () => {
		const frame = initialFrame(landscape, side);
		expect(zoomTo(frame, 0.01, 150, 150, landscape, side).scale).toBeCloseTo(0.1);
		expect(zoomTo(frame, 10, 150, 150, landscape, side).scale).toBeCloseTo(0.1 * MAX_ZOOM);
		// Zooming 2× on the centre keeps the photo's centre in the middle.
		const zoomed = zoomTo(frame, 0.2, 150, 150, landscape, side);
		const shown = sourceRect(zoomed, side);
		expect(shown.size).toBeCloseTo(1500);
		expect(shown.x + shown.size / 2).toBeCloseTo(2000);
		expect(shown.y + shown.size / 2).toBeCloseTo(1500);
	});

	it('never leaves part of the square empty', () => {
		const frame = clampFrame({ x: 40, y: -9999, scale: 0.1 }, landscape, side);
		expect(frame.x).toBe(0);
		expect(frame.y).toBeCloseTo(0);
	});
});
