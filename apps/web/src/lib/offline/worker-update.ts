// Asks Chrome to fetch the service worker again now (S17.12). Chrome checks on its own only on a
// page load, and an installed app brought back to the front loads nothing, so a phone could keep
// the build before the last deploy's offline files for a day. Called once Kit sees a new version
// (StatusBanner); the new worker installs, takes over and caches the new build by itself.

export async function updateWorker(
	container: ServiceWorkerContainer | undefined = typeof navigator === 'undefined'
		? undefined
		: navigator.serviceWorker
): Promise<void> {
	try {
		await (await container?.getRegistration())?.update();
	} catch {
		// Offline, or the worker script failed: Chrome tries again on the next page load.
	}
}
