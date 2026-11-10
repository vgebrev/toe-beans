// How the UI names FR-03's skill areas, in library order.
import type { SkillArea } from '@toe-beans/contracts';

export const skillAreaLabels: Record<SkillArea, string> = {
	'name-recognition': 'Name',
	recall: 'Recall',
	toileting: 'Toilet training',
	greetings: 'Calm greetings',
	settling: 'Settling',
	doorbell: 'Doorbell',
	barking: 'Barking',
	'loose-leash': 'Loose-lead walking',
	cats: 'Around cats'
};

export const skillAreas = Object.keys(skillAreaLabels) as SkillArea[];

/** The `?area=` filter, if it names a skill area. */
export function skillAreaParam(value: string | null): SkillArea | null {
	return value !== null && Object.hasOwn(skillAreaLabels, value) ? (value as SkillArea) : null;
}

/** Plain text with blank lines between paragraphs (contracts `Exercise`). */
export const paragraphs = (text: string): string[] =>
	text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean);
