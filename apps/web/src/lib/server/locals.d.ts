// Server-only additions to App.Locals. They live here rather than in app.d.ts because they use
// backend types, which client-side code may not import (architecture §4.2).
import type { Viewer } from '@toe-beans/backend';

declare global {
	namespace App {
		interface Locals {
			/** The signed-in person, resolved from the session cookie in hooks.server.ts; null when signed out. */
			viewer: Viewer | null;
		}
	}
}

export {};
