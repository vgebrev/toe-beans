<script lang="ts">
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
</script>

<svelte:head><title>History · Toe Beans</title></svelte:head>

<PageHeader title="History" />
<EmptyState
	icon="history"
	title="No history yet"
	text="Logged sessions and notable moments will build up here."
/>
