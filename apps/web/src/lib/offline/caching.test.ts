import { describe, expect, it } from 'vitest';
import {
	cachesToDelete,
	isGatewayError,
	MAINTENANCE_HEADER,
	mayBeCold,
	precachePaths,
	QUIET_FOR_MS,
	showsUnreachable
} from './caching.js';

describe('precachePaths', () => {
	it('keeps the Latin font files and everything else, and drops the other subsets', () => {
		const paths = [
			'_app/immutable/entry/start.Ab12.js',
			'_app/immutable/assets/app.Cd34.css',
			'_app/immutable/assets/nunito-latin-wght-normal.BzFMHfZw.woff2',
			'_app/immutable/assets/nunito-latin-ext-wght-normal.CXYtwYOx.woff2',
			'_app/immutable/assets/nunito-cyrillic-wght-normal.CY6AOgYE.woff2',
			'_app/immutable/assets/fredoka-latin-wght-normal.DM6njrJ3.woff2',
			'_app/immutable/assets/fredoka-hebrew-wght-normal.DdnsCkLr.woff2',
			'icons/icon-192.png',
			'offline'
		];
		expect(precachePaths(paths)).toEqual([
			'_app/immutable/entry/start.Ab12.js',
			'_app/immutable/assets/app.Cd34.css',
			'_app/immutable/assets/nunito-latin-wght-normal.BzFMHfZw.woff2',
			'_app/immutable/assets/fredoka-latin-wght-normal.DM6njrJ3.woff2',
			'icons/icon-192.png',
			'offline'
		]);
	});
});

describe('isGatewayError', () => {
	it('is the platform answering for the app, not the app itself', () => {
		expect([502, 503, 504].every(isGatewayError)).toBe(true);
		expect([200, 404, 500].some(isGatewayError)).toBe(false);
	});
});

describe('showsUnreachable', () => {
	const answer = (status: number, headers: Record<string, string> = {}) => ({
		status,
		headers: new Headers(headers)
	});

	it("stands in for a gateway error, but not for the edge's maintenance page", () => {
		expect(showsUnreachable(answer(503))).toBe(true);
		expect(showsUnreachable(answer(502))).toBe(true);
		expect(showsUnreachable(answer(503, { [MAINTENANCE_HEADER]: '1' }))).toBe(false);
		expect(showsUnreachable(answer(200))).toBe(false);
	});
});

describe('mayBeCold', () => {
	it('is true when the server has not answered yet, or not lately', () => {
		expect(mayBeCold(1_000, null)).toBe(true);
		expect(mayBeCold(QUIET_FOR_MS + 5, 5)).toBe(true);
	});

	it('is false right after the server answered, so the waking page cannot come round again', () => {
		expect(mayBeCold(10_000, 9_000)).toBe(false);
	});
});

describe('cachesToDelete', () => {
	it("keeps this build's cache and the one before it, for a page still on the old build", () => {
		expect(
			cachesToDelete(['toe-beans-1', 'toe-beans-2', 'other', 'toe-beans-3'], 'toe-beans-3')
		).toEqual(['toe-beans-1']);
	});

	it('deletes nothing on a first install or a reinstall of the same build', () => {
		expect(cachesToDelete(['toe-beans-3'], 'toe-beans-3')).toEqual([]);
		expect(cachesToDelete([], 'toe-beans-3')).toEqual([]);
	});
});
