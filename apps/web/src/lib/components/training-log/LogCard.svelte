<script lang="ts">
	// A logged practice as a card (ui.md §4.1, §8 #2): when, the dog's avatar and name, the
	// exercise, how it went and who practised. The whole card opens the log.
	import { resolve } from '$app/paths';
	import type { Dog, SessionLog } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import OutcomeBadge from './OutcomeBadge.svelte';

	interface Props {
		log: SessionLog;
		dog: Dog | undefined;
	}

	let { log, dog }: Props = $props();
</script>

<a
	href={resolve('/(app)/logs/[id]', { id: log.id })}
	class="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
>
	<span class="w-12 shrink-0 font-bold tabular-nums"
		><span class="sr-only">Done at </span>{log.time}</span
	>
	{#if dog}
		<DogAvatar {dog} size={36} />
	{/if}
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="font-bold break-words">{log.exercise.title}</span>
		<span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
			<span>{dog?.name ?? 'A dog no longer here'}</span>
			<OutcomeBadge outcome={log.outcome} short />
			<span>by {log.caregiver}</span>
		</span>
	</span>
</a>
