<script lang="ts">
	// The app shell (ui.md §2.1): each destination scrolls above the fixed bottom bar. The active
	// dog is shared by every page under it (§2.2). A navigation that takes a while shows a
	// skeleton in place of the page, then "Waking up Toe Beans…" (§5.2, NFR-09): with the app
	// left open, the server may have gone to sleep since the last tap.
	import { onMount } from 'svelte';
	import { navigating } from '$app/state';
	import BottomNav from '#lib/components/shell/BottomNav.svelte';
	import LoadingSkeleton from '#lib/components/shell/LoadingSkeleton.svelte';
	import { ActiveDog, setActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const active = setActiveDog(new ActiveDog());
	onMount(() => active.restore());

	/** A quick navigation just swaps pages; only a slow one shows the skeleton. */
	const SLOW_AFTER_MS = 400;
	let slow = $state(false);
	$effect(() => {
		if (!navigating.to) {
			slow = false;
			return;
		}
		const timer = setTimeout(() => (slow = true), SLOW_AFTER_MS);
		return () => clearTimeout(timer);
	});
</script>

<div class="mx-auto flex min-h-dvh max-w-xl flex-col">
	<!-- Bottom padding: the bar's 4 rem plus the phone's gesture/button area. -->
	<main class="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
		{#if slow}
			<LoadingSkeleton wakeAfterMs={3000 - SLOW_AFTER_MS} />
		{/if}
		<!-- Hidden rather than removed, so the page keeps its state if the navigation stays on it. -->
		<div class={slow ? 'hidden' : 'contents'}>
			{@render children()}
		</div>
	</main>
</div>
<BottomNav />
