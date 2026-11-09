import { SkillArea } from '@toe-beans/contracts';
import { describe, expect, it } from 'vitest';
import { paragraphs, skillAreaParam, skillAreas } from './skill-areas.js';

describe('skill areas', () => {
	it('names every area in library order', () => {
		expect(skillAreas).toEqual(SkillArea.options);
	});

	it('reads the filter only when it names an area', () => {
		expect(skillAreaParam('recall')).toBe('recall');
		expect(skillAreaParam('constructor')).toBeNull();
		expect(skillAreaParam(null)).toBeNull();
	});

	it('splits text on blank lines', () => {
		expect(paragraphs('One\nstill one.\n\n  \nTwo.\n')).toEqual(['One\nstill one.', 'Two.']);
	});
});
