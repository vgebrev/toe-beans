<script lang="ts">
	// The dog switcher in the top bar (ui.md §2.2): with more than one dog, a button showing the
	// dog chosen (or All dogs) that opens a sheet listing All dogs first, then each dog; with one,
	// just that dog's avatar, which opens its profile. Archived dogs aren't in it. The choice is
	// per device (ActiveDog).
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Dog } from '@toe-beans/contracts';
	import FilterSheet from '#lib/components/filter/FilterSheet.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import DogAvatar from './DogAvatar.svelte';

	const ALL = 'all';

	const active = getActiveDog();
	const dogs = $derived(
		((page.data as { dogs?: Dog[] | null }).dogs ?? []).filter((d) => !d.archived)
	);
	const selected = $derived(active.among(dogs));
	const options = $derived([
		{ id: ALL, label: 'All dogs', dog: null },
		...dogs.map((dog) => ({ id: dog.id, label: dog.name, dog }))
	]);
</script>

{#if dogs.length === 1}
	<a
		href={resolve('/(app)/dogs/[id]', { id: dogs[0]!.id })}
		class="flex min-h-12 items-center gap-2 self-start rounded-full pr-3 font-bold"
	>
		<DogAvatar dog={dogs[0]!} size={40} />
		{dogs[0]!.name}
	</a>
{:else if dogs.length > 1}
	<FilterSheet
		title="Show dog"
		{options}
		selected={selected?.id ?? ALL}
		onselect={(id) => active.select(id === ALL ? null : id)}
	>
		{#snippet leading(option)}
			<span data-leading class="flex size-9 shrink-0 items-center justify-center">
				{#if option.dog}
					<DogAvatar dog={option.dog} size={36} />
				{:else}
					<Icon name="paw" />
				{/if}
			</span>
		{/snippet}
	</FilterSheet>
{/if}
