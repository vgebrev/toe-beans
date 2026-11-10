// The content gate (architecture §3.8, NFR-14): the real library must parse, be reviewed, use no
// unacknowledged flagged terms, and cover all nine skill areas. Runs in CI with `pnpm test`, and
// alone as `pnpm content:check`. Every problem is listed, so one run shows the reviewer them all.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { libraryProblems } from '../../domain/exercise.js';
import { readExerciseFiles } from './exercise-files.js';

const directory = fileURLToPath(new URL('../../../../../content/exercises', import.meta.url));

describe('the exercise library in content/exercises', () => {
	it('may ship', async () => {
		const exercises = await readExerciseFiles(directory);
		expect(libraryProblems(exercises)).toEqual([]);
	});
});
