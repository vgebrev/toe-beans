<script lang="ts">
	// A planned session as a card (ui.md §4.1, §4.3, §5.5): the time, the dog's avatar and name, the
	// exercise, ↻ for a repeating one, and its status when it isn't simply planned, with the
	// outcome once logged. The card opens the session; an action (Today's *Log*) sits beside it,
	// outside the link.
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Dog, PlannedSession } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import OutcomeBadge from '#lib/components/training-log/OutcomeBadge.svelte';
	import { statusLabels } from '#lib/planner/status.js';
	import { dogNameOf } from '#lib/dogs/name.js';

	interface Props {
		session: PlannedSession;
		dog: Dog | undefined;
		/** A planned session whose time has passed. */
		overdue?: boolean;
		/** The day when it isn't the one on show, e.g. "Yesterday". */
		day?: string | undefined;
		/** Rendered with the session. */
		action?: Snippet<[PlannedSession]>;
	}

	let { session, dog, overdue = false, day, action }: Props = $props();
	const inactive = $derived(session.status === 'skipped' || session.status === 'cancelled');
	const href = $derived(resolve('/(app)/sessions/[id]', { id: session.id }));
</script>

<!-- At large text (ui.md §7) the card is narrow in rem: its time and status move under the title
     and an action drops below, so the title keeps its width. 18rem is 288 px at the default size. -->
{#snippet status(placement: string)}
	{#if session.status !== 'planned'}
		<span
			class="{placement} shrink-0 rounded-full border border-border px-3 py-0.5 text-sm font-bold"
			>{statusLabels[session.status]}</span
		>
	{:else if overdue}
		<span class="{placement} shrink-0 text-sm font-bold text-warn">Missed</span>
	{/if}
{/snippet}

{#snippet body()}
	<span class="w-12 shrink-0 font-bold tabular-nums @max-[18rem]:hidden">{session.time}</span>
	{#if dog}
		<DogAvatar {dog} size={36} />
	{/if}
	<span class="flex min-w-0 flex-1 flex-col">
		<span class={['font-bold break-words', inactive && 'line-through']}>
			{session.exercise.title}
		</span>
		<span class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
			<span class="hidden font-bold text-foreground tabular-nums @max-[18rem]:inline"
				>{session.time}</span
			>
			<span>{dogNameOf(dog)}</span>
			{#if day}<span class="font-bold text-warn">{day}</span>{/if}
			{#if session.plan}
				<span class="inline-flex items-center gap-1">
					<Icon name="repeat" size={16} />
					<span>Repeats</span>
				</span>
			{/if}
			{#if session.log}
				<OutcomeBadge outcome={session.log.outcome} short />
			{/if}
			{@render status('hidden @max-[18rem]:inline')}
		</span>
	</span>
	{@render status('@max-[18rem]:hidden')}
{/snippet}

{#if action}
	<div class="@container rounded-2xl border border-border bg-card">
		<div
			class="flex items-center gap-2 pr-3 @max-[18rem]:flex-col @max-[18rem]:items-stretch @max-[18rem]:pr-0"
		>
			<a {href} class="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 @max-[18rem]:pr-4">
				{@render body()}
			</a>
			<div class="shrink-0 @max-[18rem]:self-end @max-[18rem]:px-4 @max-[18rem]:pb-3">
				{@render action(session)}
			</div>
		</div>
	</div>
{:else}
	<a
		{href}
		class={[
			'@container flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3',
			inactive && 'text-muted-foreground'
		]}
	>
		{@render body()}
	</a>
{/if}
