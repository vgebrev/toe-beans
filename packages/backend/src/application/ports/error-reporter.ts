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
