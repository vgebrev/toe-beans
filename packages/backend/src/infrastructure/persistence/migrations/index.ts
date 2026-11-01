// Every migration, in run order. Add new ones at the end; never edit one that has been deployed.
import { authIndexes } from './0001-auth.js';
import type { Migration } from './runner.js';

export const migrations: readonly Migration[] = [authIndexes];

export { migrate, type Migration } from './runner.js';
