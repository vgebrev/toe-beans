import { describe, expect, it } from 'vitest';
import { isActive, tabs } from './nav.js';

const active = (routeId: string | null) =>
	tabs.filter((tab) => isActive(tab, routeId)).map((tab) => tab.label);

describe('isActive', () => {
	it('marks exactly one tab for each destination and its subpages', () => {
		expect(active('/(app)')).toEqual(['Today']);
		expect(active('/(app)/plan')).toEqual(['Plan']);
		expect(active('/(app)/care/[id]')).toEqual(['Care']);
		expect(active('/(app)/more')).toEqual(['More']);
	});

	it('does not match on a shared prefix, outside the shell or on an unmatched route', () => {
		expect(active('/(app)/planner')).toEqual([]);
		expect(active('/join/[token]')).toEqual([]);
		expect(active(null)).toEqual([]);
	});
});
