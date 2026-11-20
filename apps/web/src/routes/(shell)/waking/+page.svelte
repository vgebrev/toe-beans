<script lang="ts">
	// A page load the server hasn't answered within a second, after a quiet spell: most likely a
	// cold start (architecture §8.4, NFR-09). The service worker shows this skeleton meanwhile,
	// then it waits for the server to answer /healthz, which it does once it's up, and loads the
	// page that was asked for (the address bar still shows it). The service worker lets that
	// load through without waiting, so this can't come round again.
	import { onMount } from 'svelte';
	import LoadingSkeleton, { WAKE_AFTER_MS } from '#lib/components/shell/LoadingSkeleton.svelte';
	import { WAKING_AFTER_MS } from '#lib/offline/caching.js';

	let message = $state<string | null>(null);

	onMount(() => {
		const started = Date.now();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;

		async function poll() {
			try {
				const response = await fetch('/healthz', { cache: 'no-store' });
				// Opened as itself, there's no other page to load.
				if (response.ok && location.pathname !== '/waking') {
					location.reload();
					return;
				}
			} catch {
				// No answer yet: offline, or still starting.
			}
			if (stopped) return;
			if (!navigator.onLine)
				message = "Can't reach Toe Beans at the moment. It opens as soon as it's back.";
			else if (Date.now() - started > 20_000)
				message = 'Toe Beans is taking longer than usual to connect…';
			else message = null;
			timer = setTimeout(poll, 1000);
		}

		const now = () => {
			clearTimeout(timer);
			void poll();
		};
		window.addEventListener('online', now);
		void poll();
		return () => {
			stopped = true;
			clearTimeout(timer);
			window.removeEventListener('online', now);
		};
	});
</script>

<svelte:head><title>Toe Beans</title></svelte:head>

<!-- The service worker waited a second already, so the connecting message comes 3 s from the tap. -->
<LoadingSkeleton wakeAfterMs={WAKE_AFTER_MS - WAKING_AFTER_MS} {message} />
