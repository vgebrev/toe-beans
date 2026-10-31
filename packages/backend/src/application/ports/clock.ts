/** The current instant. Use cases take it as a port so tests control time (architecture §7). */
export interface Clock {
	now(): Date;
}
