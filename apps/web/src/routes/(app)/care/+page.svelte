<script lang="ts">
	// Care (ui.md §2.1, J6, FR-10, scenario 7): the switcher's dog's care tasks, or every dog's.
	// *Overdue* (still upcoming on a day that's gone), *Coming up* soonest first, then *Done and
	// cancelled*, folded. Each card opens its task. Tasks of an archived dog wait, out of sight,
	// until the dog comes back (architecture D30).
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { CareTask, Dog } from '@toe-beans/contracts';
	import CareCard from '#lib/components/care/CareCard.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const active = getActiveDog();
	const dogs = $derived(data.dogs ?? []);
	const current = $derived(dogs.filter((d) => !d.archived));
	const selectedDog = $derived(active.among(current));
	const dogOf = (dogId: string): Dog | undefined => dogs.find((d) => d.id === dogId);
	const mine = (list: readonly CareTask[]) =>
		list.filter((t) => !selectedDog || t.dogId === selectedDog.id);

	const overdue = $derived(mine(data.care?.upcoming ?? []).filter((t) => t.overdue));
	const upcoming = $derived(mine(data.care?.upcoming ?? []).filter((t) => !t.overdue));
	const closed = $derived(mine(data.care?.closed ?? []));
	const nothing = $derived(overdue.length + upcoming.length + closed.length === 0);
	const notice = $derived(page.state.notice ?? null);

	onMount(() => {
		const refresh = () => {
			if (document.visibilityState === 'visible') void invalidateAll();
		};
		document.addEventListener('visibilitychange', refresh);
		return () => document.removeEventListener('visibilitychange', refresh);
	});
</script>

<svelte:head><title>Care · Toe Beans</title></svelte:head>

<PageHeader title="Care" switcher />

{#if data.dogs !== null && current.length === 0}
	<EmptyState
		icon="dog"
		title="Add your dog"
		text="Every care task belongs to a dog, so start with yours."
	/>
	<div class="px-8">
		<Button href={resolve('/(app)/dogs/new')} class="w-full">Add a dog</Button>
	</div>
{:else}
	<div class="flex flex-col gap-6 px-4 pt-2 pb-8">
		<p aria-live="polite" class="rounded-2xl bg-soft px-4 py-3 empty:hidden">{notice ?? ''}</p>

		<Button href={resolve('/(app)/care/new')}>
			<Icon name="add" />
			Add care task
		</Button>

		{#if !data.care}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't load care tasks — check your connection, then reload.
			</p>
		{:else if nothing}
			<EmptyState
				icon="vaccination"
				title="No care tasks yet"
				text="Add vaccinations, deworming, vet visits and puppy school, and they show up here and on Today in the week before."
			/>
		{:else}
			{#if overdue.length > 0}
				<section aria-labelledby="care-overdue-heading" class="flex flex-col gap-3">
					<h2
						id="care-overdue-heading"
						class="flex items-center gap-2 font-display text-lg font-semibold text-warn"
					>
						<Icon name="alert" size={20} />
						Overdue ({overdue.length})
					</h2>
					<ul class="flex flex-col gap-3">
						{#each overdue as task (task.id)}
							<li><CareCard {task} dog={dogOf(task.dogId)} today={data.today} /></li>
						{/each}
					</ul>
				</section>
			{/if}

			<section aria-labelledby="care-upcoming-heading" class="flex flex-col gap-3">
				<h2 id="care-upcoming-heading" class="font-display text-lg font-semibold">Coming up</h2>
				{#if upcoming.length === 0}
					<p class="text-muted-foreground">
						Nothing coming up{selectedDog ? ` for ${selectedDog.name}` : ''}.
					</p>
				{:else}
					<ul class="flex flex-col gap-3">
						{#each upcoming as task (task.id)}
							<li><CareCard {task} dog={dogOf(task.dogId)} today={data.today} /></li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if closed.length > 0}
				<details class="group">
					<summary
						class="flex min-h-12 cursor-pointer list-none items-center gap-2 font-display text-lg font-semibold text-muted-foreground"
					>
						<Icon name="forward" size={20} class="transition-transform group-open:rotate-90" />
						Done and cancelled ({closed.length})
					</summary>
					<ul class="flex flex-col gap-3 pt-3">
						{#each closed as task (task.id)}
							<li><CareCard {task} dog={dogOf(task.dogId)} today={data.today} /></li>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}
	</div>
{/if}
