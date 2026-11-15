<script lang="ts">
	// A page still loading (ui.md §5.2, NFR-09): a header and cards in outline straight away, then
	// "Waking up Toe Beans…" once it's taking long enough to be a cold start (3 s from the tap).
	// The app shell shows it during a slow navigation, and the service worker's waking page
	// (routes/(shell)/waking) during a slow first load.
	import { onMount } from 'svelte';
	import Logo from '#lib/components/Logo.svelte';

	interface Props {
		/** How long until the waking message, from when this appears. */
		wakeAfterMs?: number;
		/** Said instead of the waking message, such as that the connection dropped. */
		message?: string | null;
	}

	let { wakeAfterMs = 3000, message = null }: Props = $props();

	let waking = $state(false);
	onMount(() => {
		const timer = setTimeout(() => (waking = true), wakeAfterMs);
		return () => clearTimeout(timer);
	});

	const block = 'rounded-2xl bg-soft motion-safe:animate-pulse';
</script>

<div aria-busy="true" class="flex flex-col gap-6 px-4 pt-5 pb-8">
	<div class="flex items-center gap-2.5">
		<Logo size={30} />
		<div class="h-7 w-32 {block}"></div>
	</div>
	<!-- Screen readers hear the status line rather than empty shapes. -->
	<p role="status" class={message || waking ? 'px-4 py-3 text-center font-bold' : 'sr-only'}>
		{message ?? (waking ? 'Waking up Toe Beans…' : 'Loading…')}
	</p>
	<div aria-hidden="true" class="flex flex-col gap-3">
		<div class="h-5 w-24 {block}"></div>
		<div class="h-20 {block}"></div>
		<div class="h-20 {block}"></div>
		<div class="h-5 w-28 {block}"></div>
		<div class="h-20 {block}"></div>
	</div>
</div>
