<script lang="ts">
	// The persistent banner at the top of every screen (ui.md §5.2).
	// - While saves can't get through (NFR-04). Save buttons stay enabled: a save fails straight
	//   away with the same message, and the form keeps everything for *Retry*.
	// - Once a new version is deployed: Kit's `updated` checks `_app/version.json` when the app
	//   comes back to the front, on its hourly poll and on page data responses. *Refresh* loads
	//   the new build. Never while Toe Beans can't be reached, as a reload would only find the
	//   *Can't reach Toe Beans* page.
	import { updated } from '$app/state';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { connection } from '#lib/client/connection.svelte.js';

	// One message whether the phone is offline or the app is down: the phone's own flag isn't
	// always right, and the person can't tell the difference from here either.
	const text = $derived(
		connection.state === 'online'
			? null
			: "Can't reach Toe Beans at the moment. Changes can't be saved right now."
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
	{:else if updated.current}
		<p
			class="flex items-center gap-3 bg-foreground pt-[calc(0.25rem+env(safe-area-inset-top))] pr-2 pb-1 pl-4 text-sm font-bold text-background"
		>
			<Icon name="update" class="shrink-0" />
			<span class="flex-1">A new version of Toe Beans is ready.</span>
			<button
				type="button"
				class="min-h-12 shrink-0 rounded-full px-4 underline underline-offset-4"
				onclick={() => location.reload()}
			>
				Refresh
			</button>
		</p>
	{/if}
</div>
