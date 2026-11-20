<script lang="ts">
	// A page load the server hasn't answered within a second, after a quiet spell: most likely a
	// cold start (architecture §8.4, NFR-09), or a phone whose connection is still waking up. The
	// service worker shows this skeleton meanwhile, then it checks the server answers (/readyz,
	// #lib/offline/reachable.ts) and loads the page that was asked for (the address bar still
	// shows it). The service worker lets that load through without waiting, so this can't come
	// round again. A check gives up after 10 s, so one stuck request can't hold up the rest.
	import { onMount } from 'svelte';
	import LoadingSkeleton, {
		LONG_AFTER_MS,
		WAKE_AFTER_MS
	} from '#lib/components/shell/LoadingSkeleton.svelte';
	import { noteStuckLoad } from '#lib/client/stuck-load.js';
	import { WAKING_AFTER_MS } from '#lib/offline/caching.js';
	import { checkServer, type CheckOutcome } from '#lib/offline/reachable.js';

	let message = $state<string | null>(null);
	// For the report if it sticks (S17.11).
	let checks = 0;
	let lastCheck: CheckOutcome | 'none yet' = 'none yet';

	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;

		async function poll() {
			checks++;
			lastCheck = await checkServer();
			// Opened as itself, there's no other page to load.
			if (lastCheck === 'answered' && location.pathname !== '/waking') {
				location.reload();
				return;
			}
			if (stopped) return;
			// After 20 s the skeleton itself says it's taking longer than usual, with Refresh.
			message = navigator.onLine
				? null
				: "Can't reach Toe Beans at the moment. It opens as soon as it's back.";
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
<LoadingSkeleton
	wakeAfterMs={WAKE_AFTER_MS - WAKING_AFTER_MS}
	longAfterMs={LONG_AFTER_MS - WAKING_AFTER_MS}
	{message}
	onLong={() => void noteStuckLoad({ where: 'waking page', checks, lastCheck })}
/>
