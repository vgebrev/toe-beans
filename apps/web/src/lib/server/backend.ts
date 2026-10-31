// The one backend instance, built when the server starts (hooks.server.ts `init`). Route handlers
// call `backend()` and stay thin adapters (architecture §3.3).
import { createBackend, loadConfig, type Backend } from '@toe-beans/backend';

let instance: Backend | undefined;

export function startBackend(): void {
	// Not declared in src/env.ts: the backend validates its own config (architecture §7), so it
	// throws here and the server never starts on a bad deploy.
	instance = createBackend(loadConfig(process.env));
}

export function backend(): Backend {
	if (!instance) throw new Error('backend() called before startBackend()');
	return instance;
}
