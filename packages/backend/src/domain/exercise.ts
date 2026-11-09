// The curated exercise library (architecture §3.8, §5.2, FR-03, NFR-14). Exercises are content,
// not data: they're read from files, never written by the app, and the rules here gate what may
// ship.

/** FR-03's nine skill areas, in the order the library shows them. */
export const SKILL_AREAS = [
	'name-recognition',
	'recall',
	'toileting',
	'greetings',
	'settling',
	'doorbell',
	'barking',
	'loose-leash',
	'cats'
] as const;
export type SkillArea = (typeof SKILL_AREAS)[number];

export interface ExerciseSource {
	title: string;
	url: string;
	kind: 'article' | 'video';
}

export interface Exercise {
	/** A stable slug, e.g. `recall-basics`. Logs keep it, so it never changes once shipped. */
	id: string;
	/** Bumped on any substantive edit; logs keep the version they were practised against. */
	contentVersion: number;
	title: string;
	skillArea: SkillArea;
	goal: string;
	setup: string;
	steps: readonly string[];
	suggestedDurationMin: number;
	successCriteria: string;
	ifStruggling: string;
	safetyNotes?: string;
	sources: readonly ExerciseSource[];
	/** Who reviewed it, and when. Both or neither: without them it's a draft. */
	review?: { by: string; at: string };
	/** Flagged terms the reviewer read in context and kept (see `flaggedTerms`). */
	reviewedTerms: readonly string[];
}

/**
 * Words that often signal punitive or aversive methods (NFR-14). A match isn't always wrong
 * ("the correct spot"), so the reviewer either rewrites it or lists the term in `reviewedTerms`.
 */
export const FLAGGED_TERMS: Readonly<Record<string, RegExp>> = {
	correct: /\bcorrect(?:s|ed|ing|ion|ions|ive)?\b/i,
	punish: /\bpunish(?:es|ed|ing|ment|ments)?\b/i,
	alpha: /\balpha\b/i,
	dominance: /\bdomina(?:nce|nt|te|tes|ting|tion)\b/i,
	'pack leader': /\bpack[- ]leader/i,
	submission: /\bsubmi(?:ssion|ssive|t)\b/i,
	'leash pop': /\b(?:leash|lead)[- ](?:pop|jerk|correction)s?\b/i,
	scruff: /\bscruff/i,
	'aversive collar': /\b(?:choke|prong|pinch|shock|e-|electric|spray|citronella)[- ]?collars?\b/i,
	'spray bottle': /\bspray(?:ing)? (?:bottle|water)\b/i,
	'physical force': /\b(?:hit|hitting|smack|smacking|slap|slapping|yank|yanking|jerk|jerking)\b/i,
	scold: /\b(?:scold|scolding|tell(?:ing)? (?:them|it|your puppy|your dog) off)\b/i,
	shout: /\b(?:shout|shouting|yell|yelling)\b/i,
	'rub nose': /\brub(?:bing)? (?:their|its|the puppy's|your puppy's) nose\b/i
};

const textOf = (e: Exercise): [field: string, text: string][] => [
	['title', e.title],
	['goal', e.goal],
	['setup', e.setup],
	...e.steps.map((s, i): [string, string] => [`steps[${i}]`, s]),
	['successCriteria', e.successCriteria],
	['ifStruggling', e.ifStruggling],
	...(e.safetyNotes ? [['safetyNotes', e.safetyNotes] as [string, string]] : [])
];

/** Every flagged term in the exercise's text, with where it was found. */
export function flaggedTerms(e: Exercise): { term: string; field: string }[] {
	const found: { term: string; field: string }[] = [];
	for (const [field, text] of textOf(e)) {
		for (const [term, pattern] of Object.entries(FLAGGED_TERMS)) {
			if (pattern.test(text)) found.push({ term, field });
		}
	}
	return found;
}

/**
 * What stops the library shipping: an unreviewed exercise, a flagged term nobody has looked at, a
 * stale acknowledgement, or a skill area with no exercise (architecture §3.8). Empty when it may ship.
 */
export function libraryProblems(exercises: readonly Exercise[]): string[] {
	const problems: string[] = [];
	for (const e of exercises) {
		if (!e.review) problems.push(`${e.id}: not reviewed yet (set reviewedBy and reviewedAt)`);
		const flagged = flaggedTerms(e);
		for (const { term, field } of flagged) {
			if (!e.reviewedTerms.includes(term)) {
				problems.push(
					`${e.id}: "${term}" in ${field} may describe an aversive method; reword it, or list it in reviewedTerms once checked`
				);
			}
		}
		for (const term of e.reviewedTerms) {
			if (!(term in FLAGGED_TERMS)) {
				problems.push(`${e.id}: reviewedTerms lists "${term}", which isn't a flagged term`);
			} else if (!flagged.some((f) => f.term === term)) {
				problems.push(`${e.id}: reviewedTerms lists "${term}", which no longer appears`);
			}
		}
	}
	const covered = new Set(exercises.map((e) => e.skillArea));
	for (const area of SKILL_AREAS) {
		if (!covered.has(area)) problems.push(`no exercise covers the "${area}" skill area (FR-03)`);
	}
	return problems;
}

/** The library's order: by skill area, then as given (file name order). */
export function sortExercises(exercises: readonly Exercise[]): Exercise[] {
	const rank = (e: Exercise) => SKILL_AREAS.indexOf(e.skillArea);
	return [...exercises].sort((a, b) => rank(a) - rank(b));
}
