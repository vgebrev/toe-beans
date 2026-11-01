<script lang="ts">
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
</script>

<svelte:head><title>Care · Toe Beans</title></svelte:head>

<PageHeader title="Care" />
<EmptyState
	icon="vaccination"
	title="No care tasks yet"
	text="Vaccinations, deworming and vet visits will be listed here."
/>
