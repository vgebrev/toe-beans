<script lang="ts">
	import { onMount } from 'svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// In the household's time zone and the device's locale (ui.md §5.4). The server can't know
	// the locale, so it's formatted on the device.
	let date = $state('');
	onMount(() => {
		date = new Intl.DateTimeFormat(undefined, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			timeZone: data.household.timeZone
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
