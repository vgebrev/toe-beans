// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			/** Shown with unexpected errors, so a report can be matched to the logs (NFR-12). */
			requestId?: string;
			/** In the browser, the page's data or code couldn't be fetched: not a bug. */
			unreachable?: boolean;
		}
		// `viewer` is added in lib/server/locals.d.ts, which may import backend types.
		interface Locals {
			requestId: string;
		}
		// interface PageData {}
		/** Survives a `goto`, so a page can say what just happened on the one before. */
		interface PageState {
			notice?: string;
			/** A log or event just deleted, for History's *Undo* (ui.md J8). */
			deleted?: import('#lib/history/deleted.js').Deleted;
		}
		// interface Platform {}
	}
}

export {};
