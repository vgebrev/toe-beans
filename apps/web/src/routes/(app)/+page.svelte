<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Null means the list didn't load, which isn't the same as having no dogs.
	const noDogs = $derived(data.dogs !== null && !data.dogs.some((d) => !d.archived));

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

<PageHeader title="Today" subtitle={date} switcher />
{#if noDogs}
	<EmptyState
		icon="dog"
		title="Add your dog"
		text="Every training session, event and care task belongs to a dog, so start with yours."
	/>
	<div class="px-8">
		<Button href={resolve('/(app)/dogs/new')} class="w-full">Add a dog</Button>
	</div>
{:else}
	<EmptyState
		icon="paw"
		title="Nothing planned yet"
		text="Today's training sessions and care reminders will show up here."
	/>
{/if}
