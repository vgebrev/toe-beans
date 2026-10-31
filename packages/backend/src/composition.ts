// Composition root: wires infrastructure adapters into use cases (architecture §4.1). S0.2 fills
// in config, Clock and IDs; later slices add repositories, the push sender and the worker.
export type Backend = Record<string, never>;

export function createBackend(): Backend {
	return {};
}
