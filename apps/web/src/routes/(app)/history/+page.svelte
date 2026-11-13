<script lang="ts">
	// History (ui.md §4.4): the timeline arrives with S10. Its "+" already records events and logs
	// training, and each opens its own page.
	import AddMenu from '#lib/components/shell/AddMenu.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>History · Toe Beans</title></svelte:head>

<PageHeader title="History" switcher />
<EmptyState
	icon="history"
	title="No history yet"
	text="Logged sessions and notable moments will build up here."
/>

<AddMenu dogs={data.dogs} timeZone={data.household.timeZone} />
