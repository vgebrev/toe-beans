// Every migration, in run order. Add new ones at the end; never edit one that has been deployed.
import { authIndexes } from './0001-auth.js';
import { householdIndexes } from './0002-households.js';
import { deactivatedHouseholds } from './0003-deactivated-households.js';
import { dogIndexes } from './0004-dogs.js';
import { cueIndexes } from './0005-cues.js';
import { plannerIndexes } from './0006-planner.js';
import type { Migration } from './runner.js';

export const migrations: readonly Migration[] = [
	authIndexes,
	householdIndexes,
	deactivatedHouseholds,
	dogIndexes,
	cueIndexes,
	plannerIndexes
];

export { migrate, type Migration } from './runner.js';
