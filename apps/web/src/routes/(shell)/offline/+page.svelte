<script lang="ts">
	// A page load that got no response (ui.md §5.2 Offline, NFR-04).
	import FallbackMessage from '#lib/components/shell/FallbackMessage.svelte';
</script>

<FallbackMessage
	title="You're offline"
	text="Toe Beans needs a connection to load your household's data. It opens again as soon as you're back online."
/>
