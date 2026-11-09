// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			/** Shown with unexpected errors, so a report can be matched to the logs (NFR-12). */
			requestId?: string;
		}
		// `viewer` is added in lib/server/locals.d.ts, which may import backend types.
		interface Locals {
			requestId: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
