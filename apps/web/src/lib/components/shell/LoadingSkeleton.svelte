<script lang="ts" module>
	/** From the tap to the connecting message: long enough to be a cold start (ui.md §5.2). */
	export const WAKE_AFTER_MS = 3000;
	/** From the tap to "taking longer than usual" and *Refresh*: no cold start takes this long. */
	export const LONG_AFTER_MS = 20_000;
</script>

<script lang="ts">
	// A page still loading (ui.md §5.2, NFR-09): a header and cards in outline straight away, then
	// "Connecting to Toe Beans…" once it's taking long enough to be a cold start (3 s from the tap),
	// then after 20 s that it's taking longer than usual, with *Refresh*: a load stuck past a cold
	// start (an old build's files, a lost request) has always come right on a reload.
	// The app shell shows it during a slow navigation, and the service worker's waking page
	// (routes/(shell)/waking) during a slow first load.
	import { onMount } from 'svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	interface Props {
		/** How long until the connecting message, from when this appears. */
		wakeAfterMs?: number;
		/** How long until "taking longer than usual" and *Refresh*, from when this appears. */
		longAfterMs?: number;
		/** Where *Refresh* goes: the page being navigated to, or this one reloaded. */
		refreshTo?: string;
		/** Said instead of the connecting message, such as that Toe Beans can't be reached. */
		message?: string | null;
		/** When it starts offering *Refresh*: the load is stuck, worth reporting (S17.11). */
		onLong?: () => void;
	}

	let {
		wakeAfterMs = WAKE_AFTER_MS,
		longAfterMs = LONG_AFTER_MS,
		refreshTo,
		message = null,
		onLong
	}: Props = $props();

	let waking = $state(false);
	let long = $state(false);
	onMount(() => {
		const timers = [
			setTimeout(() => (waking = true), wakeAfterMs),
			setTimeout(() => {
				long = true;
				onLong?.();
			}, longAfterMs)
		];
		return () => timers.forEach(clearTimeout);
	});

	const status = $derived(
		message ??
			(long
				? 'Toe Beans is taking longer than usual to connect…'
				: waking
					? 'Connecting to Toe Beans…'
					: 'Loading…')
	);

	function refresh() {
		if (refreshTo) location.assign(refreshTo);
		else location.reload();
	}

	// Still, once it says it can't connect: nothing is loading any more (S17.12).
	const block = $derived(`rounded-2xl bg-soft ${message ? '' : 'motion-safe:animate-pulse'}`);
</script>

<div aria-busy="true" class="flex flex-col gap-6 px-4 pt-5 pb-8">
	<div class="flex items-center gap-2.5">
		<Logo size={30} />
		<div class="h-7 w-32 {block}"></div>
	</div>
	<!-- Screen readers hear the status line rather than empty shapes. -->
	<p role="status" class={message || waking ? 'px-4 py-3 text-center font-bold' : 'sr-only'}>
		{status}
	</p>
	<!-- Not while it says Toe Beans can't be reached: a reload would only find the fallback page. -->
	{#if long && !message}
		<Button variant="outline" class="self-center" onclick={refresh}>Refresh</Button>
	{/if}
	<div aria-hidden="true" class="flex flex-col gap-3">
		<div class="h-5 w-24 {block}"></div>
		<div class="h-20 {block}"></div>
		<div class="h-20 {block}"></div>
		<div class="h-5 w-28 {block}"></div>
		<div class="h-20 {block}"></div>
	</div>
</div>
