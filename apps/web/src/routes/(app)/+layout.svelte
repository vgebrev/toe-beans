<script lang="ts">
	// The app shell (ui.md §2.1): each destination scrolls above the fixed bottom bar. The active
	// dog is shared by every page under it (§2.2).
	import { onMount } from 'svelte';
	import BottomNav from '#lib/components/shell/BottomNav.svelte';
	import { ActiveDog, setActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const active = setActiveDog(new ActiveDog());
	onMount(() => active.restore());
</script>

<div class="mx-auto flex min-h-dvh max-w-xl flex-col">
	<!-- Bottom padding: the bar's 4 rem plus the phone's gesture/button area. -->
	<main class="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
		{@render children()}
	</main>
</div>
<BottomNav />
