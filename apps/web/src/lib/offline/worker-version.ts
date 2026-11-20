// Which build the service worker in control is (S17.11). The page comes from the server, so its
// own version is the latest deployed; the worker's cached pages and files can be a build behind
// until its update installs, and an install fails as a whole if any file doesn't download.

/** Null with no worker in control; `unknown` from a worker too old to say. */
export function workerVersion(timeoutMs = 1000): Promise<string | null> {
	const worker = typeof navigator === 'undefined' ? null : navigator.serviceWorker?.controller;
	if (!worker) return Promise.resolve(null);
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		const timer = setTimeout(() => resolve('unknown'), timeoutMs);
		channel.port1.onmessage = (event) => {
			clearTimeout(timer);
			resolve(typeof event.data === 'string' ? event.data : 'unknown');
		};
		worker.postMessage('version', [channel.port2]);
	});
}
