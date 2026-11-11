<script lang="ts">
	// A session log (ui.md §2.3, FR-07): which dog, which exercise, when, how it went and the
	// optional context, who practised and who changed it last. *Edit* opens the quick log with it
	// (J8); a change made elsewhere meanwhile is never overwritten (§5.2).
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import OutcomeBadge from '#lib/components/training-log/OutcomeBadge.svelte';
	import QuickLogSheet from '#lib/components/training-log/QuickLogSheet.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { dayName } from '#lib/planner/dates.js';
	import { moodLabels, placeLabels } from '#lib/training-log/labels.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const log = $derived(data.log);
	const dog = $derived(data.dogs?.find((d) => d.id === log?.dogId));
	let notice = $state<string | null>(page.state.notice ?? null);
	let sheetOpen = $state(false);
	let round = $state(0);

	function edit() {
		round++;
		sheetOpen = true;
	}

	async function saved() {
		notice = 'Saved.';
		await invalidateAll();
	}
</script>

<svelte:head><title>{log?.exercise.title ?? 'Log'} · Toe Beans</title></svelte:head>

<PageHeader title={log?.exercise.title ?? 'Log'}>
	{#if log?.plannedSessionId}
		<a
			href={resolve('/(app)/sessions/[id]', { id: log.plannedSessionId })}
			class="flex min-h-12 items-center gap-1 self-start font-bold"
		>
			<Icon name="back" />
			Session
		</a>
	{:else}
		<a
			href={log
				? resolve('/(app)/library/[id]', { id: log.exercise.id })
				: resolve('/(app)/library')}
			class="flex min-h-12 items-center gap-1 self-start font-bold"
		>
			<Icon name="back" />
			Exercise
		</a>
	{/if}
</PageHeader>

<div class="flex flex-col gap-6 px-4 pt-2 pb-8">
	<p aria-live="polite" class="rounded-2xl bg-soft px-4 py-3 empty:hidden">{notice ?? ''}</p>

	{#if !log}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this log — check your connection, then reload.
		</p>
	{:else}
		<dl class="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4">
			<div class="flex items-center gap-3">
				<dt class="sr-only">Dog</dt>
				<dd class="flex items-center gap-3 font-bold">
					{#if dog}<DogAvatar {dog} size={48} />{/if}
					{dog?.name ?? 'A dog no longer here'}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">When</dt>
				<dd class="font-bold">{dayName(log.date, data.today)} at {log.time}</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">How it went</dt>
				<dd class="pt-1"><OutcomeBadge outcome={log.outcome} /></dd>
			</div>
			{#if log.emotionalState}
				<div>
					<dt class="text-sm text-muted-foreground">Mood</dt>
					<dd class="font-bold">{moodLabels[log.emotionalState].full}</dd>
				</div>
			{/if}
			{#if log.environment}
				<div>
					<dt class="text-sm text-muted-foreground">Where</dt>
					<dd class="font-bold">
						{placeLabels[log.environment].full}{log.environmentNote
							? ` · ${log.environmentNote}`
							: ''}
					</dd>
				</div>
			{/if}
			{#if log.durationMin}
				<div>
					<dt class="text-sm text-muted-foreground">Duration</dt>
					<dd class="font-bold">{log.durationMin} min</dd>
				</div>
			{/if}
			{#if log.notes}
				<div>
					<dt class="text-sm text-muted-foreground">Notes</dt>
					<dd class="whitespace-pre-line">{log.notes}</dd>
				</div>
			{/if}
			<div>
				<dt class="text-sm text-muted-foreground">Practised by</dt>
				<dd>{log.caregiver}</dd>
			</div>
			{#if log.updatedBy !== log.caregiver}
				<div>
					<dt class="text-sm text-muted-foreground">Last changed by</dt>
					<dd>{log.updatedBy}</dd>
				</div>
			{/if}
		</dl>

		<a
			href={resolve('/(app)/library/[id]', { id: log.exercise.id })}
			class="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 font-bold"
		>
			See the instructions
			<Icon name="forward" class="text-muted-foreground" />
		</a>

		{#if data.dogs}
			<Button aria-haspopup="dialog" onclick={edit}>
				<Icon name="edit" />
				Edit
			</Button>
		{/if}
	{/if}
</div>

{#if log && data.dogs}
	{#key round}
		<QuickLogSheet
			bind:open={sheetOpen}
			target={{ kind: 'log', log }}
			dogs={data.dogs}
			timeZone={data.household.timeZone}
			onfinished={saved}
		/>
	{/key}
{/if}
