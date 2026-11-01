<script lang="ts">
	import { onMount } from 'svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';

	// Formatted on the device, in its locale and time zone (ui.md §5.4). The server can't know
	// either yet; the household time zone takes over in S2.
	let date = $state('');
	onMount(() => {
		date = new Intl.DateTimeFormat(undefined, {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		}).format(new Date());
	});
</script>

<svelte:head><title>Today · Toe Beans</title></svelte:head>

<PageHeader title="Today" subtitle={date} />
<EmptyState
	icon="paw"
	title="Nothing planned yet"
	text="Today's training sessions and care reminders will show up here."
/>
