<script lang="ts">
	// A behaviour event as a card in History (ui.md §4.4): when, the dog's avatar, what happened
	// with its icon, the trigger if given, the dog's name and who recorded it. The whole card
	// opens the event.
	import { resolve } from '$app/paths';
	import type { BehaviourEvent, Dog } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { categoryLabels } from '#lib/journal/labels.js';

	interface Props {
		event: BehaviourEvent;
		dog: Dog | undefined;
	}

	let { event, dog }: Props = $props();
	const category = $derived(categoryLabels[event.category]);
</script>

<a
	href={resolve('/(app)/events/[id]', { id: event.id })}
	class="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
>
	<span class="w-12 shrink-0 font-bold tabular-nums"
		><span class="sr-only">At </span>{event.time}</span
	>
	{#if dog}
		<DogAvatar {dog} size={36} />
	{/if}
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="flex items-center gap-2 font-bold">
			<Icon name={category.icon} size={20} class="shrink-0 text-primary" />
			{category.label}
		</span>
		{#if event.trigger}
			<span class="truncate text-sm">{event.trigger}</span>
		{/if}
		<span class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
			<span>{dog?.name ?? 'A dog no longer here'}</span>
			<span>by {event.recordedBy}</span>
		</span>
	</span>
</a>
