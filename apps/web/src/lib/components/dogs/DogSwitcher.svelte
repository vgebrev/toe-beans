<script lang="ts">
	// The dog switcher in the top bar (ui.md §2.2): a chip per dog plus All dogs when there's more
	// than one; with one, just that dog's avatar, which opens its profile. Archived dogs aren't in
	// it. The choice is per device (ActiveDog).
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Dog } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import { cn } from '#lib/utils.js';
	import DogAvatar from './DogAvatar.svelte';

	const active = getActiveDog();
	const dogs = $derived(
		((page.data as { dogs?: Dog[] | null }).dogs ?? []).filter((d) => !d.archived)
	);
	const selected = $derived(active.among(dogs));

	const chip =
		'flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-1.5 pr-4 font-bold aria-pressed:border-primary aria-pressed:bg-soft';
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
	<div role="group" aria-label="Show dog" class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
		{#each dogs as dog (dog.id)}
			<button
				type="button"
				class={cn(chip, 'border-border')}
				aria-pressed={selected?.id === dog.id}
				onclick={() => active.select(dog.id)}
			>
				<DogAvatar {dog} size={36} ring={selected?.id === dog.id} />
				{dog.name}
			</button>
		{/each}
		<button
			type="button"
			class={cn(chip, 'border-border pl-4')}
			aria-pressed={selected === null}
			onclick={() => active.select(null)}
		>
			<Icon name="paw" />
			All dogs
		</button>
	</div>
{/if}
