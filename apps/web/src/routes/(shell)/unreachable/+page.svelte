<script lang="ts">
	// A page load that got no answer, or a 502, 503 or 504 from the platform (ui.md §5.2,
	// architecture D31). The phone may be offline or the app down, and from here the two can't be
	// told apart reliably, so it blames neither.
	import FallbackMessage from '#lib/components/shell/FallbackMessage.svelte';
</script>

<FallbackMessage
	title="Can't reach Toe Beans"
	text="Toe Beans is unavailable at the moment: your connection or the app may be down. It opens again as soon as it's back."
/>
