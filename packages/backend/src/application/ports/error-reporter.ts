/**
 * Sends unexpected errors (bugs, not `AppError`s) to error tracking (architecture §9). Logging them
 * is the caller's job: this is the alerting side.
 */
export interface ErrorReporter {
	/** `tags` are short, non-sensitive strings such as a route ID. Never throws. */
	capture(error: unknown, tags?: Record<string, string>): void;
	/** Sends queued events; call on shutdown. */
	flush(): Promise<void>;
}

/** What became of a browser's error report sent on through the app (architecture D41). */
export type ErrorRelayOutcome =
	/** The tracker answered; its status and the headers that tell the SDK to back off. */
	| { kind: 'sent'; status: number; headers: Record<string, string> }
	/** Not an envelope, or one for another project: never sent anywhere. */
	| { kind: 'refused' }
	/** The tracker didn't answer in time, or at all. */
	| { kind: 'failed' };

/**
 * Sends the browser's error reports on to error tracking from the server, so ad blockers that
 * block the tracker's own host don't drop them (architecture D41). Only reports for the app's own
 * project are sent, and only to the tracker the app is configured with.
 */
export interface ErrorRelay {
	/** False when error reporting is off: there's nowhere to send to. */
	readonly enabled: boolean;
	/** `envelope` is the SDK's request body as it arrived. Never throws. */
	relay(envelope: Uint8Array<ArrayBuffer>): Promise<ErrorRelayOutcome>;
}
