// The one backend instance, built when the server starts (hooks.server.ts `init`). Route handlers
// call `backend()` and stay thin adapters (architecture §3.3).
import { createBackend, loadConfig, type Backend } from '@toe-beans/backend';

let instance: Backend | undefined;

/**
 * adapter-node awaits `init` before it listens, so the server only takes requests once Mongo is
 * connected and migrated (S-1.4). A bad config or unreachable database stops the start.
 */
export async function startBackend(): Promise<void> {
	// Not declared in src/env.ts: the backend validates its own config (architecture §7), so it
	// throws here and the server never starts on a bad deploy.
	instance = await createBackend(loadConfig(process.env));
	// adapter-node emits this once the HTTP server has closed on SIGTERM/SIGINT.
	process.once('sveltekit:shutdown', () => void instance?.close());
}

export function backend(): Backend {
	if (!instance) throw new Error('backend() called before startBackend()');
	return instance;
}
