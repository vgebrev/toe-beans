<script lang="ts">
	// The household's shared cue dictionary, from More (ui.md §4.6, FR-04): the cue word, what it
	// means, the hand signal and the reward, with who edited each last. Tapping a cue edits it in
	// a sheet; Add a cue opens the same sheet empty.
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Cue } from '@toe-beans/contracts';
	import CueSheet from '#lib/components/cues/CueSheet.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { editedWhen } from '#lib/cues/edited.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The time is worded on the device, which knows the clock and locale; the server can't.
	let now = $state<Date | null>(null);
	onMount(() => {
		now = new Date();
		const timer = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(timer);
	});

	let sheetOpen = $state(false);
	let editing = $state<Cue | null>(null);
	/** Remounts the sheet, so each opening starts from the cue it was given. */
	let session = $state(0);
	let notice = $state<string | null>(null);

	function openSheet(cue: Cue | null) {
		editing = cue;
		session++;
		sheetOpen = true;
	}

	async function finished(message: string) {
		notice = message;
		await invalidateAll();
	}
</script>

<svelte:head><title>Cue dictionary · Toe Beans</title></svelte:head>

<PageHeader title="Cue dictionary">
	<a href={resolve('/(app)/more')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		More
	</a>
</PageHeader>

<div class="flex flex-col gap-6 px-4 pt-2">
	<p aria-live="polite" class="text-sm text-muted-foreground empty:hidden">{notice ?? ''}</p>

	{#if data.cues === null}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load the cues — check your connection, then reload.
		</p>
	{:else}
		{#if data.cues.length === 0}
			<EmptyState
				icon="cues"
				title="No cues yet"
				text="Add the words you use, like Sit or Leave it, so everyone says them the same way."
			/>
		{:else}
			<p class="text-muted-foreground">
				The words, hand signals and rewards your household agrees on. Tap a cue to change it.
			</p>
			<ul class="flex flex-col gap-3" aria-label="Cues">
				{#each data.cues as cue (cue.id)}
					<li>
						<button
							type="button"
							class="flex w-full flex-col gap-2 rounded-2xl border border-border px-4 py-3 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
							aria-haspopup="dialog"
							onclick={() => openSheet(cue)}
						>
							<span class="flex items-center justify-between gap-3">
								<span class="font-display text-lg font-semibold break-words">{cue.label}</span>
								<Icon name="edit" size={20} class="shrink-0 text-muted-foreground" />
							</span>
							<span class="whitespace-pre-line">{cue.meaning}</span>
							{#if cue.handSignal || cue.rewardConvention}
								<dl class="flex flex-col gap-1 text-sm">
									{#if cue.handSignal}
										<div>
											<dt class="inline font-bold">Hand signal:</dt>
											<dd class="inline">{cue.handSignal}</dd>
										</div>
									{/if}
									{#if cue.rewardConvention}
										<div>
											<dt class="inline font-bold">Reward:</dt>
											<dd class="inline">{cue.rewardConvention}</dd>
										</div>
									{/if}
								</dl>
							{/if}
							{#if cue.notes}
								<span class="text-sm whitespace-pre-line text-muted-foreground">{cue.notes}</span>
							{/if}
							<span class="text-sm text-muted-foreground">
								Last edited by {cue.updatedBy}{#if now}, <time datetime={cue.updatedAt}
										>{editedWhen(cue.updatedAt, now, data.household.timeZone)}</time
									>{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<Button class="w-full" aria-haspopup="dialog" onclick={() => openSheet(null)}>
			<Icon name="add" />
			Add a cue
		</Button>
	{/if}
</div>

{#key session}
	<CueSheet bind:open={sheetOpen} cue={editing} onfinished={finished} />
{/key}
