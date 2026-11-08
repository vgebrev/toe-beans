<script lang="ts">
	// Editing a dog's details (ui.md §4.5); the photo changes on the profile. Keyed by ETag, so
	// "See their version" after a conflict starts the form again from the newer dog.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DogForm from '#lib/components/dogs/DogForm.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { todayIn } from '#lib/dogs/age.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Edit {data.dog?.name ?? 'dog'} · Toe Beans</title></svelte:head>

<PageHeader title={data.dog ? `Edit ${data.dog.name}` : 'Edit dog'}>
	{#if data.dog}
		<a
			href={resolve('/(app)/dogs/[id]', { id: data.dog.id })}
			class="flex min-h-12 items-center gap-1 self-start font-bold"
		>
			<Icon name="back" />
			{data.dog.name}
		</a>
	{/if}
</PageHeader>

<div class="px-4 pt-2">
	{#if data.dog}
		{#key data.dog.etag}
			<DogForm
				dog={data.dog}
				today={todayIn(data.household.timeZone)}
				submitLabel="Save"
				onsaved={(dog) =>
					goto(resolve('/(app)/dogs/[id]', { id: dog.id }), { invalidateAll: true })}
			/>
		{/key}
	{:else}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this dog — check your connection, then reload.
		</p>
	{/if}
</div>
