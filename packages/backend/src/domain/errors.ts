// Expected failures the domain reports when an invariant would break. The http layer maps them to
// problem+json (architecture §7); application/errors.ts adds the ones only use cases know about.

export interface ValidationError {
	kind: 'validation';
	message: string;
	/** Field-level messages keyed by dotted path, shown inline by the UI (ui.md §5.2). */
	fields?: Record<string, string[]>;
}

/** The request is valid but clashes with current state, e.g. removing a household's last owner. */
export interface ConflictError {
	kind: 'conflict';
	message: string;
}

export type DomainError = ValidationError | ConflictError;

export const validationError = (
	message: string,
	fields?: Record<string, string[]>
): ValidationError =>
	fields ? { kind: 'validation', message, fields } : { kind: 'validation', message };

export const conflictError = (message: string): ConflictError => ({ kind: 'conflict', message });
