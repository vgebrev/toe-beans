// Every migration, in run order. Add new ones at the end; never edit one that has been deployed.
import type { Migration } from './runner.js';

export const migrations: readonly Migration[] = [];

export { migrate, type Migration } from './runner.js';
