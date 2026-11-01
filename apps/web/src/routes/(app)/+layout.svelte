<script lang="ts">
	// The app shell (ui.md §2.1): each destination scrolls above the fixed bottom bar.
	import BottomNav from '#lib/components/shell/BottomNav.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="mx-auto flex min-h-dvh max-w-xl flex-col">
	<!-- Bottom padding: the bar's 4 rem plus the phone's gesture/button area. -->
	<main class="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
		{@render children()}
	</main>
</div>
<BottomNav />
