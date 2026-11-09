// Reads the exercise library from `content/exercises/*.yaml` (architecture §3.8): one file per
// exercise, named after its id. The file format is checked here; what may ship is the domain's
// `libraryProblems`, enforced by the content test in CI and by `loadExerciseCatalogue` in prod.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import type { ExerciseCatalogue, Logger } from '../../application/ports/index.js';
import {
	libraryProblems,
	SKILL_AREAS,
	sortExercises,
	type Exercise
} from '../../domain/exercise.js';

const text = z
	.string()
	.trim()
	.min(1)
	.max(4000)
	// Paragraphs are separated by a blank line. Within one, a line break is only how the YAML
	// was wrapped (a `|` block keeps it), so it becomes a space.
	.transform((s) =>
		s
			.split(/\n\s*\n/)
			.map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
			.join('\n\n')
	);

const ExerciseFile = z
	.strictObject({
		id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a kebab-case slug'),
		contentVersion: z.int().min(1),
		title: z.string().trim().min(1).max(80),
		skillArea: z.enum(SKILL_AREAS),
		goal: text,
		setup: text,
		steps: z.array(text).min(1).max(15),
		suggestedDurationMin: z.int().min(1).max(60),
		successCriteria: text,
		ifStruggling: text,
		safetyNotes: text.optional(),
		sources: z
			.array(
				z.strictObject({
					title: z.string().trim().min(1).max(200),
					url: z.url({ protocol: /^https$/ }),
					kind: z.enum(['article', 'video'])
				})
			)
			.min(1),
		reviewedBy: z.string().trim().min(1).max(100).optional(),
		reviewedAt: z.iso.date().optional(),
		reviewedTerms: z.array(z.string()).default([])
	})
	.refine((e) => (e.reviewedBy === undefined) === (e.reviewedAt === undefined), {
		message: 'set reviewedBy and reviewedAt together',
		path: ['reviewedAt']
	});

/** A file that isn't a valid exercise. Lists every problem, so one run shows them all. */
export class ExerciseFileError extends Error {
	override name = 'ExerciseFileError';
	constructor(readonly problems: string[]) {
		super(`The exercise library has problems:\n- ${problems.join('\n- ')}`);
	}
}

/** Every exercise in `directory`, in library order. Throws ExerciseFileError on any bad file. */
export async function readExerciseFiles(directory: string): Promise<Exercise[]> {
	const files = (await readdir(directory)).filter((f) => f.endsWith('.yaml')).sort();
	const problems: string[] = [];
	const exercises: Exercise[] = [];
	for (const file of files) {
		let raw: unknown;
		try {
			raw = parse(await readFile(join(directory, file), 'utf8'));
		} catch (error) {
			problems.push(`${file}: not valid YAML (${(error as Error).message.split('\n')[0]})`);
			continue;
		}
		const parsed = ExerciseFile.safeParse(raw);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				problems.push(`${file}: ${issue.path.join('.') || '(file)'}: ${issue.message}`);
			}
			continue;
		}
		const { reviewedBy, reviewedAt, safetyNotes, ...e } = parsed.data;
		if (`${e.id}.yaml` !== file) problems.push(`${file}: id "${e.id}" must match the file name`);
		exercises.push({
			...e,
			...(safetyNotes && { safetyNotes }),
			...(reviewedBy && reviewedAt && { review: { by: reviewedBy, at: reviewedAt } })
		});
	}
	if (problems.length > 0) throw new ExerciseFileError(problems);
	return sortExercises(exercises);
}

/**
 * The nearest `content/exercises` at or above `start`: the image's /app, or the repo root from
 * apps/web when running `pnpm dev` and the e2e build.
 */
export function findContentDirectory(start = process.cwd()): string {
	for (let dir = resolve(start); ; dir = dirname(dir)) {
		const candidate = join(dir, 'content', 'exercises');
		if (existsSync(candidate)) return candidate;
		if (dirname(dir) === dir) {
			throw new Error(`No content/exercises directory at or above ${start}; set CONTENT_DIR`);
		}
	}
}

export interface CatalogueOptions {
	/** In prod, anything `libraryProblems` reports stops the start; locally it's a warning, so drafts can be read in the app while they're reviewed. */
	strict: boolean;
	logger: Logger;
}

/** Loads the library once (a disposable in-memory cache, NFR-08). */
export async function loadExerciseCatalogue(
	directory: string,
	{ strict, logger }: CatalogueOptions
): Promise<ExerciseCatalogue> {
	const exercises = await readExerciseFiles(directory);
	const problems = libraryProblems(exercises);
	if (problems.length > 0) {
		if (strict) throw new ExerciseFileError(problems);
		for (const problem of problems) logger.warn('exercise library', { problem });
	}
	const byId = new Map(exercises.map((e) => [e.id, e]));
	return { all: () => exercises, get: (id) => byId.get(id) };
}
