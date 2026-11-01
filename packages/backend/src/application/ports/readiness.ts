/** Whether the backend can serve requests: the database answers (architecture §8.1, `/readyz`). */
export interface Readiness {
	/** Resolves when ready. Rejects, within a few seconds, with the reason when not. */
	check(): Promise<void>;
}
