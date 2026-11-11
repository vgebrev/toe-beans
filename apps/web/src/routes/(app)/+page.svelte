<script lang="ts">
	// Today (ui.md §4.1, FR-06): what to do today, for the switcher's dog or all of them. Overdue
	// (today's and yesterday's still planned), Planned by time, Done (every practice logged today,
	// with how it went and who practised), and Skipped collapsed. A planned card opens the session;
	// *Log* opens the quick log (§4.2) straight away. There are no live updates (NFR-13): the day
	// is fetched again whenever the app comes back to the front, so it's never a morning stale.
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Dog, PlannedSession } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import SessionCard from '#lib/components/planner/SessionCard.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import LogCard from '#lib/components/training-log/LogCard.svelte';
	import QuickLogSheet from '#lib/components/training-log/QuickLogSheet.svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import { dayName, formatDate } from '#lib/planner/dates.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const active = getActiveDog();
	const dogs = $derived(data.dogs ?? []);
	// Null means the list didn't load, which isn't the same as having no dogs.
	const noDogs = $derived(data.dogs !== null && !data.dogs.some((d) => !d.archived));
	const selectedDog = $derived(active.among(dogs.filter((d) => !d.archived)));
	const dogOf = (dogId: string): Dog | undefined => dogs.find((d) => d.id === dogId);
	const mine = <T extends { dogId: string }>(list: readonly T[]): T[] =>
		list.filter((item) => !selectedDog || item.dogId === selectedDog.id);

	const day = $derived(data.today);
	const overdue = $derived(mine(day?.overdue ?? []));
	const planned = $derived(mine(day?.planned ?? []));
	const done = $derived(mine(day?.done ?? []));
	const skipped = $derived(mine(day?.skipped ?? []));
	const nothing = $derived(overdue.length + planned.length + done.length + skipped.length === 0);

	// In the device's locale (ui.md §5.4), which the server can't know, so it's formatted here.
	let date = $state('');
	$effect(() => {
		if (day) date = formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' });
	});

	let notice = $state<string | null>(null);
	let logOpen = $state(false);
	/** Bumped on each open, so the quick log starts afresh. */
	let logRound = $state(0);
	let logging = $state<PlannedSession | null>(null);

	function openLog(session: PlannedSession) {
		logging = session;
		logRound++;
		logOpen = true;
	}

	async function logged() {
		notice = `Logged. ${logging?.exercise.title ?? 'The session'} is done.`;
		await invalidateAll();
	}

	onMount(() => {
		const refresh = () => {
			if (document.visibilityState === 'visible' && !logOpen) void invalidateAll();
		};
		document.addEventListener('visibilitychange', refresh);
		return () => document.removeEventListener('visibilitychange', refresh);
	});

	const scheduleHref = $derived(
		day ? `${resolve('/(app)/plan/new')}?date=${day.date}` : resolve('/(app)/plan/new')
	);
</script>

<svelte:head><title>Today · Toe Beans</title></svelte:head>

{#snippet logButton(session: PlannedSession)}
	<Button
		class="px-4"
		aria-haspopup="dialog"
		aria-label="Log {session.exercise.title} for {dogOf(session.dogId)?.name ?? 'the dog'}"
		onclick={() => openLog(session)}
	>
		<Icon name="log" />
		Log
	</Button>
{/snippet}

<PageHeader title="Today" subtitle={date} switcher />

{#if noDogs}
	<EmptyState
		icon="dog"
		title="Add your dog"
		text="Every training session, event and care task belongs to a dog, so start with yours."
	/>
	<div class="px-8">
		<Button href={resolve('/(app)/dogs/new')} class="w-full">Add a dog</Button>
	</div>
{:else}
	<div class="flex flex-col gap-6 px-4 pt-2 pb-8">
		<p aria-live="polite" class="rounded-2xl bg-soft px-4 py-3 empty:hidden">{notice ?? ''}</p>

		{#if !day}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't load today — check your connection, then reload.
			</p>
		{:else if nothing}
			<EmptyState
				icon="paw"
				title="Nothing planned today"
				text="Plan a short session with one of the library’s exercises, and it shows up here on the day."
			/>
			<div class="flex flex-col gap-3">
				<!-- scheduleHref resolves the route; the query picks the date. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={scheduleHref} class={buttonVariants()}>
					<Icon name="schedule" />
					Schedule
				</a>
				<a href={resolve('/(app)/library')} class={buttonVariants({ variant: 'outline' })}>
					<Icon name="library" />
					Browse the library
				</a>
			</div>
		{:else}
			{#if overdue.length > 0}
				<section aria-labelledby="overdue-heading" class="flex flex-col gap-3">
					<h2
						id="overdue-heading"
						class="flex items-center gap-2 font-display text-lg font-semibold text-warn"
					>
						<Icon name="alert" size={20} />
						Overdue ({overdue.length})
					</h2>
					<ul class="flex flex-col gap-3">
						{#each overdue as session (session.id)}
							<li>
								<SessionCard
									{session}
									dog={dogOf(session.dogId)}
									day={session.date === day.date ? undefined : dayName(session.date, day.date)}
									action={logButton}
								/>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if planned.length > 0}
				<section aria-labelledby="planned-heading" class="flex flex-col gap-3">
					<h2 id="planned-heading" class="font-display text-lg font-semibold">Planned</h2>
					<ul class="flex flex-col gap-3">
						{#each planned as session (session.id)}
							<li>
								<SessionCard {session} dog={dogOf(session.dogId)} action={logButton} />
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if done.length > 0}
				<section aria-labelledby="done-heading" class="flex flex-col gap-3">
					<h2 id="done-heading" class="font-display text-lg font-semibold">Done</h2>
					<ul class="flex flex-col gap-3">
						{#each done as log (log.id)}
							<li><LogCard {log} dog={dogOf(log.dogId)} /></li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if skipped.length > 0}
				<details class="group">
					<summary
						class="flex min-h-12 cursor-pointer list-none items-center gap-2 font-display text-lg font-semibold text-muted-foreground"
					>
						<Icon name="forward" size={20} class="transition-transform group-open:rotate-90" />
						Skipped ({skipped.length})
					</summary>
					<ul class="flex flex-col gap-3 pt-3">
						{#each skipped as session (session.id)}
							<li><SessionCard {session} dog={dogOf(session.dogId)} /></li>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}
	</div>
{/if}

{#if logging && data.dogs}
	{#key logRound}
		<QuickLogSheet
			bind:open={logOpen}
			target={{ kind: 'session', session: logging }}
			dogs={data.dogs}
			timeZone={data.household.timeZone}
			onfinished={logged}
		/>
	{/key}
{/if}
