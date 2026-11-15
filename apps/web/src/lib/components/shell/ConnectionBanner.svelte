<script lang="ts">
	// The persistent banner while saves can't get through (ui.md §5.2 Offline, NFR-04). Save
	// buttons stay enabled: a save fails straight away with the same message, and the form keeps
	// everything for *Retry*.
	import Icon from '#lib/components/icon/Icon.svelte';
	import { connection } from '#lib/client/connection.svelte.js';

	const text = $derived(
		connection.state === 'offline'
			? "You're offline. Changes can't be saved right now."
			: connection.state === 'unreachable'
				? "Can't reach Toe Beans. Changes can't be saved right now."
				: null
	);
</script>

<!-- Always in the page, so screen readers announce it when it fills in. -->
<div role="status" class="sticky top-0 z-40 empty:hidden">
	{#if text}
		<p
			class="flex items-center gap-3 bg-foreground px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 text-sm font-bold text-background"
		>
			<Icon name="offline" class="shrink-0" />
			<span>{text}</span>
		</p>
	{/if}
</div>
