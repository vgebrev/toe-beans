// A logger that says nothing, for tests that don't look at the logs.
import type { Logger } from '../application/ports/index.js';

export const silentLogger: Logger = {
	debug() {},
	info() {},
	warn() {},
	error() {},
	child: () => silentLogger
};
