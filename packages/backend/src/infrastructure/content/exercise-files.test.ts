import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SKILL_AREAS } from '../../domain/exercise.js';
import {
	ExerciseFileError,
	findContentDirectory,
	loadExerciseCatalogue,
	readExerciseFiles
} from './exercise-files.js';

const yaml = (id: string, skillArea = 'recall', extra = '') => `id: ${id}
contentVersion: 1
title: Recall basics
skillArea: ${skillArea}
goal: Comes when called.
setup: A quiet room.
steps:
  - Call once.
  - |-
    Reward at your
    feet.


    Then again.
suggestedDurationMin: 5
successCriteria: Comes straight away.
ifStruggling: Get closer.
sources:
  - title: Recall
    url: https://example.org/recall
    kind: article
${extra}`;

const reviewed = 'reviewedBy: Owner\nreviewedAt: 2026-11-09\n';

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'exercises-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const write = (file: string, text: string) => writeFile(join(dir, file), text);
const problemsOf = async () => {
	const error = await readExerciseFiles(dir).catch((e: unknown) => e);
	expect(error).toBeInstanceOf(ExerciseFileError);
	return (error as ExerciseFileError).problems;
};
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };

describe('readExerciseFiles', () => {
	it('reads each YAML file into an exercise, in library order', async () => {
		await write('recall-basics.yaml', yaml('recall-basics', 'recall', reviewed));
		await write('a-name-game.yaml', yaml('a-name-game', 'name-recognition'));
		await write('notes.txt', 'ignored');
		const [first, second] = await readExerciseFiles(dir);
		expect(first).toMatchObject({ id: 'a-name-game', reviewedTerms: [] });
		expect(first).not.toHaveProperty('review');
		expect(second).toMatchObject({
			id: 'recall-basics',
			review: { by: 'Owner', at: '2026-11-09' },
			// Wrapped lines join; blank-line runs become one paragraph break; the trailing newline goes.
			steps: ['Call once.', 'Reward at your feet.\n\nThen again.']
		});
	});

	it('lists every problem in every file', async () => {
		await write('one.yaml', yaml('other', 'recall', 'reviewedBy: Owner\nsurprise: 1\n'));
		await write(
			'two.yaml',
			yaml('two', 'tricks').replace('https://example.org', 'http://example.org')
		);
		await write('three.yaml', 'id: [unclosed');
		const problems = await problemsOf();
		expect(problems).toContain('one.yaml: (file): Unrecognized key: "surprise"');
		expect(problems.some((p) => p.startsWith('three.yaml: not valid YAML ('))).toBe(true);
		expect(problems.some((p) => p.startsWith('two.yaml: skillArea:'))).toBe(true);
		expect(problems.some((p) => p.startsWith('two.yaml: sources.0.url:'))).toBe(true);
	});

	it('needs reviewedBy and reviewedAt together, and the id to match the file name', async () => {
		await write('recall-basics.yaml', yaml('recall-basic', 'recall', 'reviewedBy: Owner\n'));
		expect(await problemsOf()).toEqual([
			'recall-basics.yaml: reviewedAt: set reviewedBy and reviewedAt together'
		]);
		await write('recall-basics.yaml', yaml('recall-basic', 'recall', reviewed));
		expect(await problemsOf()).toEqual([
			'recall-basics.yaml: id "recall-basic" must match the file name'
		]);
	});
});

describe('loadExerciseCatalogue', () => {
	it('serves drafts locally but refuses them in prod', async () => {
		await write('recall-basics.yaml', yaml('recall-basics'));
		const warnings: unknown[] = [];
		const logger = { ...silent, warn: (_: string, fields: unknown) => warnings.push(fields) };
		const local = await loadExerciseCatalogue(dir, { strict: false, logger });
		expect(local.get('recall-basics')?.title).toBe('Recall basics');
		expect(local.get('nope')).toBeUndefined();
		expect(warnings).toContainEqual({
			problem: 'recall-basics: not reviewed yet (set reviewedBy and reviewedAt)'
		});
		await expect(loadExerciseCatalogue(dir, { strict: true, logger: silent })).rejects.toThrow(
			ExerciseFileError
		);
	});

	it('starts in prod with a reviewed library covering every area', async () => {
		for (const area of SKILL_AREAS) await write(`${area}.yaml`, yaml(area, area, reviewed));
		const catalogue = await loadExerciseCatalogue(dir, { strict: true, logger: silent });
		expect(catalogue.all().map((e) => e.skillArea)).toEqual(SKILL_AREAS);
	});
});

describe('findContentDirectory', () => {
	it('finds the nearest content/exercises at or above the start', async () => {
		await mkdir(join(dir, 'content', 'exercises'), { recursive: true });
		await mkdir(join(dir, 'apps', 'web'), { recursive: true });
		expect(findContentDirectory(join(dir, 'apps', 'web'))).toBe(join(dir, 'content', 'exercises'));
	});
});
