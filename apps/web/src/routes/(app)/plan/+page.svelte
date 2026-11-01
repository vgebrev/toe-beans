<script lang="ts">
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
</script>

<svelte:head><title>Plan · Toe Beans</title></svelte:head>

<PageHeader title="Plan" />
<EmptyState
	icon="plan"
	title="No sessions planned"
	text="Plan the week's training here, one short session at a time."
/>
