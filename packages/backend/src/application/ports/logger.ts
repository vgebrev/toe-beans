/** Structured fields on a log line. Never put tokens, emails, push endpoints or notes in them. */
export type LogFields = Record<string, unknown>;

/**
 * Structured logging (architecture §9, NFR-12). The adapter adds the request ID to every line
 * logged while a request is being handled, so callers don't pass it.
 */
export interface Logger {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	/** Put the caught error in `fields.err`, so its stack is serialised. */
	error(message: string, fields?: LogFields): void;
	/** A logger that adds `fields` to every line, e.g. `{ component: 'worker' }`. */
	child(fields: LogFields): Logger;
}
