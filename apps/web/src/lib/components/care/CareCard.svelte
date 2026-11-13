<script lang="ts">
	// A care task as a card (ui.md J6, §5.5): its category's icon, the dog's avatar and name, the
	// title, and when it's due; *Overdue* when its day has gone, or its status once done or
	// cancelled. The card opens the task.
	import { resolve } from '$app/paths';
	import type { CareTask, Dog } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { careLabels } from '#lib/care/labels.js';
	import { dayName, dayPhrase } from '#lib/planner/dates.js';

	interface Props {
		task: CareTask;
		dog: Dog | undefined;
		/** Today on the household's clocks. */
		today: string;
	}

	let { task, dog, today }: Props = $props();
	const closed = $derived(task.status !== 'upcoming');
	const when = $derived(
		task.status === 'completed' && task.completedOn
			? `Done ${dayPhrase(task.completedOn, today)}`
			: `${dayName(task.dueDate, today)}${task.dueTime ? ` · ${task.dueTime}` : ''}`
	);
</script>

<a
	href={resolve('/(app)/care/[id]', { id: task.id })}
	class={[
		'flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3',
		closed && 'text-muted-foreground'
	]}
>
	<Icon name={careLabels[task.category].icon} size={24} class="shrink-0 text-primary" />
	{#if dog}
		<DogAvatar {dog} size={36} />
	{/if}
	<span class="flex min-w-0 flex-1 flex-col">
		<span class={['font-bold break-words', task.status === 'cancelled' && 'line-through']}>
			{task.title}
		</span>
		<span class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
			<span>{dog?.name ?? 'A dog no longer here'}</span>
			<span class={['tabular-nums', task.overdue && 'font-bold text-warn']}>{when}</span>
		</span>
	</span>
	{#if task.overdue}
		<span class="shrink-0 text-sm font-bold text-warn">Overdue</span>
	{:else if task.status === 'completed'}
		<span class="shrink-0 rounded-full border border-border px-3 py-0.5 text-sm font-bold"
			>Done</span
		>
	{:else if task.status === 'cancelled'}
		<span class="shrink-0 rounded-full border border-border px-3 py-0.5 text-sm font-bold"
			>Cancelled</span
		>
	{/if}
</a>
