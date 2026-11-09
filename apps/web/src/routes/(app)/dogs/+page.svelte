<script lang="ts">
	// The household's dogs, from More (ui.md §2.1): the ones here now, then any archived.
	import { resolve } from '$app/paths';
	import type { Dog } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { ageText, todayIn } from '#lib/dogs/age.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const today = $derived(todayIn(data.household.timeZone));
	const current = $derived(data.dogs?.filter((d) => !d.archived) ?? []);
	const archived = $derived(data.dogs?.filter((d) => d.archived) ?? []);
</script>

<svelte:head><title>Dogs · Toe Beans</title></svelte:head>

{#snippet row(dog: Dog)}
	<li>
		<a
			href={resolve('/(app)/dogs/[id]', { id: dog.id })}
			class="flex min-h-16 items-center gap-3 rounded-2xl border border-border px-3 py-2"
		>
			<DogAvatar {dog} size={48} />
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate font-bold">{dog.name}</span>
				{#if dog.birth}
					<span class="text-sm text-muted-foreground">{ageText(dog.birth, today)}</span>
				{/if}
			</span>
			<Icon name="forward" class="text-muted-foreground" />
		</a>
	</li>
{/snippet}

<PageHeader title="Dogs">
	<a href={resolve('/(app)/more')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		More
	</a>
</PageHeader>

<div class="flex flex-col gap-8 px-4 pt-2">
	{#if data.dogs === null}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load your dogs — check your connection, then reload.
		</p>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each current as dog (dog.id)}
				{@render row(dog)}
			{/each}
		</ul>
		<Button href={resolve('/(app)/dogs/new')} class="w-full">
			<Icon name="add" />
			Add a dog
		</Button>
		{#if archived.length > 0}
			<section aria-labelledby="archived" class="flex flex-col gap-3">
				<h2
					id="archived"
					class="text-sm font-extrabold tracking-wide text-muted-foreground uppercase"
				>
					Archived
				</h2>
				<ul class="flex flex-col gap-3">
					{#each archived as dog (dog.id)}
						{@render row(dog)}
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
