<script lang="ts">
	// A behaviour event (ui.md §2.3, FR-08): which dog, what happened and when, the trigger, how
	// the puppy responded and notes, who recorded it and who changed it last. *Edit* opens the
	// record-event sheet with it (J8); a change made elsewhere meanwhile is never overwritten
	// (§5.2). *Delete…* confirms in a sheet naming it, then goes to History, the events' home,
	// which offers *Undo* (J8, architecture §5.3).
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import DeleteSheet from '#lib/components/history/DeleteSheet.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import EventSheet from '#lib/components/journal/EventSheet.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { categoryLabels, eventPhrase } from '#lib/journal/labels.js';
	import { dayName, dayPhrase } from '#lib/planner/dates.js';
	import type { PageProps } from './$types';
	import { dogNameOf } from '#lib/dogs/name.js';

	let { data }: PageProps = $props();

	const event = $derived(data.event);
	const dog = $derived(data.dogs?.find((d) => d.id === event?.dogId));
	const title = $derived(event ? categoryLabels[event.category].label : 'Event');
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

	let deleteOpen = $state(false);
	const what = $derived(event ? eventPhrase(event.category, dog?.name) : 'this event');

	async function deleted(etag: string) {
		if (!event) return;
		await goto(resolve('/(app)/history'), {
			state: { deleted: { kind: 'event', id: event.id, etag, text: `Deleted ${what}.` } }
		});
	}

	async function gone() {
		await goto(resolve('/(app)/history'), {
			state: { notice: 'That event was already deleted.' }
		});
	}

	async function changed() {
		notice = 'Someone changed this event a moment ago. This is their version.';
		await invalidateAll();
	}
</script>

<svelte:head><title>{title} · Toe Beans</title></svelte:head>

<PageHeader {title}>
	<a href={resolve('/(app)/history')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		History
	</a>
</PageHeader>

<div class="flex flex-col gap-6 px-4 pt-2 pb-8">
	<p aria-live="polite" class="rounded-2xl bg-soft px-4 py-3 empty:hidden">{notice ?? ''}</p>

	{#if !event}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this event — check your connection, then reload.
		</p>
	{:else}
		<dl class="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4">
			<div class="flex items-center gap-3">
				<dt class="sr-only">Dog</dt>
				<dd class="flex items-center gap-3 font-bold">
					{#if dog}<DogAvatar {dog} size={48} />{/if}
					{dogNameOf(dog)}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">What happened</dt>
				<dd class="flex items-center gap-2 font-bold">
					<Icon name={categoryLabels[event.category].icon} size={20} />
					{categoryLabels[event.category].label}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">When</dt>
				<dd class="font-bold">{dayName(event.date, data.today)} at {event.time}</dd>
			</div>
			{#if event.trigger}
				<div>
					<dt class="text-sm text-muted-foreground">Trigger</dt>
					<dd class="whitespace-pre-line">{event.trigger}</dd>
				</div>
			{/if}
			{#if event.response}
				<div>
					<dt class="text-sm text-muted-foreground">How your puppy responded</dt>
					<dd class="whitespace-pre-line">{event.response}</dd>
				</div>
			{/if}
			{#if event.notes}
				<div>
					<dt class="text-sm text-muted-foreground">Notes</dt>
					<dd class="whitespace-pre-line">{event.notes}</dd>
				</div>
			{/if}
			<div>
				<dt class="text-sm text-muted-foreground">Recorded by</dt>
				<dd>{event.recordedBy}</dd>
			</div>
			{#if event.updatedBy !== event.recordedBy}
				<div>
					<dt class="text-sm text-muted-foreground">Last changed by</dt>
					<dd>{event.updatedBy}</dd>
				</div>
			{/if}
		</dl>

		{#if data.dogs}
			<Button aria-haspopup="dialog" onclick={edit}>
				<Icon name="edit" />
				Edit
			</Button>
		{/if}
		<Button
			variant="ghost"
			class="self-start text-destructive"
			aria-haspopup="dialog"
			onclick={() => (deleteOpen = true)}
		>
			<Icon name="delete" />
			Delete this event
		</Button>
	{/if}
</div>

{#if event}
	<DeleteSheet
		bind:open={deleteOpen}
		kind="event"
		id={event.id}
		etag={event.etag}
		question="Delete {what} from {dayPhrase(event.date, data.today)} at {event.time}?"
		confirm="Delete event"
		ondeleted={deleted}
		ongone={gone}
		onchanged={changed}
	/>
{/if}

{#if event && data.dogs}
	{#key round}
		<EventSheet
			bind:open={sheetOpen}
			{event}
			dogs={data.dogs}
			timeZone={data.household.timeZone}
			onfinished={saved}
		/>
	{/key}
{/if}
