<script lang="ts">
	// A planned session as a card (ui.md §4.3, §5.5): the time, the dog's avatar and name, the
	// exercise, ↻ for a repeating one, and its status when it isn't simply planned, with the
	// outcome once logged. The whole card opens the session.
	import { resolve } from '$app/paths';
	import type { Dog, PlannedSession } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import OutcomeBadge from '#lib/components/training-log/OutcomeBadge.svelte';
	import { statusLabels } from '#lib/planner/status.js';

	interface Props {
		session: PlannedSession;
		dog: Dog | undefined;
		/** A planned session whose time has passed. */
		overdue?: boolean;
	}

	let { session, dog, overdue = false }: Props = $props();
	const inactive = $derived(session.status === 'skipped' || session.status === 'cancelled');
</script>

<a
	href={resolve('/(app)/sessions/[id]', { id: session.id })}
	class={[
		'flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3',
		inactive && 'text-muted-foreground'
	]}
>
	<span class="w-12 shrink-0 font-bold tabular-nums">{session.time}</span>
	{#if dog}
		<DogAvatar {dog} size={36} />
	{/if}
	<span class="flex min-w-0 flex-1 flex-col">
		<span class={['font-bold break-words', inactive && 'line-through']}>
			{session.exercise.title}
		</span>
		<span class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
			<span>{dog?.name ?? 'A dog no longer here'}</span>
			{#if session.plan}
				<span class="inline-flex items-center gap-1">
					<Icon name="repeat" size={16} />
					<span>Repeats</span>
				</span>
			{/if}
			{#if session.log}
				<OutcomeBadge outcome={session.log.outcome} short />
			{/if}
		</span>
	</span>
	{#if session.status !== 'planned'}
		<span class="shrink-0 rounded-full border border-border px-3 py-0.5 text-sm font-bold"
			>{statusLabels[session.status]}</span
		>
	{:else if overdue}
		<span class="shrink-0 text-sm font-bold text-warn">Missed</span>
	{/if}
</a>
