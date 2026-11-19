// The reminder tick as the http layer sees it (architecture §6.3): something to run, and who may
// run it. The worker implements the first, infrastructure the second.

/** What one tick did, for its log line and the scheduler's response. */
export interface TickReport {
	/** Households whose series were extended. */
	extended: number;
	/** Reminders claimed this tick, new or taken up again. */
	claimed: number;
	sent: number;
	/** Will be tried again on a later tick. */
	retrying: number;
	/** Not sent: the subject changed, nobody to send to, or the person no longer wants it. */
	skipped: number;
	failed: number;
	/** Deactivated households deleted, past the time to bring them back (D38). */
	erased: number;
}

export interface ReminderTick {
	tick(): Promise<TickReport>;
}

/**
 * Decides whether a call to the tick endpoint comes from its scheduler: Cloud Scheduler's
 * Google-signed OIDC token, or a shared secret on hosts without one.
 */
export interface TickAuthenticator {
	verify(authorization: string | null): Promise<boolean>;
}

/**
 * Tells an outside monitor that a tick ran (backlog S14.4). The monitor alerts after a silence,
 * which catches what an uptime check can't: a scheduler that stopped calling. Never throws.
 */
export interface Heartbeat {
	beat(): Promise<void>;
}
