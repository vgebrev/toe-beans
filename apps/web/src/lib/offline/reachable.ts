// Whether Toe Beans answers right now (architecture D31): the waking page, *Try again* on the
// fallback pages and the connection banner all ask this. It asks /readyz, the same path the
// deploy, the uptime monitor and the platform check, so a path that doesn't reach the app fails
// those first. Not /healthz: Google's front end in front of Cloud Run keeps that path for itself
// and answers 404 without reaching the app, so on prod every waking page waited forever (S17.11).
export const READY_PATH = '/readyz';

/**
 * How long a check may take. /readyz answers in milliseconds, so a check this slow is stuck on a
 * connection that died while the phone slept; giving up lets the next check go.
 */
export const CHECK_TIMEOUT_MS = 10_000;

/** How a check ended, as reported when a load sticks (#lib/client/stuck-load.ts). */
export type CheckOutcome = 'answered' | 'timed out' | 'no answer' | `status ${number}`;

export async function checkServer(
	fetcher: typeof fetch = fetch,
	timeoutMs = CHECK_TIMEOUT_MS
): Promise<CheckOutcome> {
	const controller = new AbortController();
	// A timer rather than AbortSignal.timeout, so tests can fast-forward it.
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetcher(READY_PATH, { cache: 'no-store', signal: controller.signal });
		return response.ok ? 'answered' : `status ${response.status}`;
	} catch {
		return controller.signal.aborted ? 'timed out' : 'no answer';
	} finally {
		clearTimeout(timer);
	}
}
