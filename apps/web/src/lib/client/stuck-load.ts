// A load stuck past 20 s, reported to Sentry (S17.11). Stuck loads can't be made to happen on
// demand, so the report says what the phone was doing: which skeleton, the page's and the service
// worker's builds, and for the waking page how its checks went. It's noted in sessionStorage when
// the skeleton offers *Refresh* and sent on the next start, as the connection that left it stuck
// may not carry a report either, and *Refresh* or a pull-down reload keeps the session. No
// personal data: versions, counts and a route ID (architecture D41).
import { version } from '$app/env';
import { workerVersion } from '#lib/offline/worker-version.js';
import { reportError } from './error-reporting.js';

const KEY = 'toe-beans-stuck-load';

export type StuckLoad =
	| { where: 'waking page'; checks: number; lastCheck: string }
	| { where: 'navigation'; route: string };

/** When the skeleton starts offering *Refresh*. */
export async function noteStuckLoad(load: StuckLoad): Promise<void> {
	const worker = (await workerVersion()) ?? 'none';
	const tags = Object.fromEntries(
		Object.entries({ ...load, page: version, worker }).map(([k, v]) => [k, String(v)])
	);
	try {
		sessionStorage.setItem(KEY, JSON.stringify(tags));
	} catch {
		// Storage blocked: the report is lost, nothing else is.
	}
}

/** Once error reporting has started (hooks.client.ts). */
export function sendStuckLoad(): void {
	let tags: Record<string, string> | null;
	try {
		const saved = sessionStorage.getItem(KEY);
		sessionStorage.removeItem(KEY);
		tags = saved ? (JSON.parse(saved) as Record<string, string>) : null;
	} catch {
		return;
	}
	if (!tags) return;
	reportError(new Error(`A load was stuck past 20 s on the ${tags.where}`), {
		stuck: tags.where ?? 'unknown',
		...tags
	});
}
