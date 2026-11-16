<script lang="ts" module>
	export interface Snack {
		text: string;
		/** A link to what it's about, already resolved. */
		href?: string;
		link?: string;
		/** A button instead, such as *Undo*. */
		action?: { label: string; run: () => void };
	}
</script>

<script lang="ts">
	// The floating "+" on Today, Plan, History and Care (ui.md §2.1): a chooser sheet with *Log
	// training* (J4: pick an exercise, then the quick log), *Record event* (J5), *Add care task*
	// (J6, its own page) and *Schedule session* (J3), the page's own kind of record first
	// (`first`). New records start with the switcher's dog.
	// Once one is saved, a snackbar says so with a link to it (§5.2), and the page reloads its
	// data so it shows up. The page can put its own message in the same snackbar, such as
	// History's *Undo* after a delete (J8). The home screen icon's shortcuts (ui.md §6.3) open
	// Today with `?add=log` or `?add=event`, which start *Log training* or *Record event*.
	import { onMount, tick } from 'svelte';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		Exercises,
		type BehaviourEvent,
		type Dog,
		type ExerciseSummary,
		type SessionLog
	} from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import type { IconName } from '#lib/components/icon/icons.js';
	import EventSheet from '#lib/components/journal/EventSheet.svelte';
	import ExercisePicker from '#lib/components/planner/ExercisePicker.svelte';
	import QuickLogSheet from '#lib/components/training-log/QuickLogSheet.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import { eventPhrase } from '#lib/journal/labels.js';

	interface Props {
		/** The household's dogs, archived too; null when they didn't load, which hides the button. */
		dogs: readonly Dog[] | null;
		timeZone: string;
		/** Where *Schedule session* goes, such as Plan's chosen day. */
		scheduleHref?: string | undefined;
		/** What the snackbar says, if anything; the page can set it too. */
		snack?: Snack | null;
		/** The choice that leads the list: what the page is about (Plan: schedule, Care: care). */
		first?: Choice;
	}

	type Choice = 'log' | 'event' | 'care' | 'schedule';

	let { dogs, timeZone, scheduleHref, snack = $bindable(null), first = 'log' }: Props = $props();

	/** The usual order, with the page's own choice moved to the top. */
	const order = $derived<Choice[]>([
		first,
		...(['log', 'event', 'care', 'schedule'] as const).filter((c) => c !== first)
	]);

	const api = createApiClient((input, init) => fetch(input, init));
	const active = getActiveDog();
	const current = $derived((dogs ?? []).filter((d) => !d.archived));
	const startDog = $derived(active.among(current)?.id ?? null);
	const nameOf = (dogId: string) => dogs?.find((d) => d.id === dogId)?.name;

	let chooserOpen = $state(false);
	let eventOpen = $state(false);
	let pickerOpen = $state(false);
	let logOpen = $state(false);
	/** Bumped on each open, so the sheets start afresh. */
	let round = $state(0);
	let exercises = $state<ExerciseSummary[] | null>(null);
	let loading = $state(false);
	let loadFailed = $state(false);
	let picked = $state<ExerciseSummary | null>(null);

	/** One sheet at a time: the chooser closes before the next opens, so focus moves cleanly. */
	async function next(open: () => void) {
		chooserOpen = false;
		await tick();
		round++;
		open();
	}

	async function logTraining() {
		if (!exercises) {
			loading = true;
			loadFailed = false;
			const result = await api.get('/exercises', Exercises);
			loading = false;
			if (!result.ok) {
				loadFailed = true;
				return;
			}
			exercises = result.data.exercises;
		}
		await next(() => (pickerOpen = true));
	}

	/** A shortcut's request, taken once: Back or a reload doesn't open it again. */
	onMount(() => {
		const add = page.url.searchParams.get('add');
		if (add === null) return;
		const url = new URL(page.url.href);
		url.searchParams.delete('add');
		// The same page, so there's no route to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(url, page.state);
		if (!dogs || current.length === 0) return;
		if (add === 'event') {
			round++;
			eventOpen = true;
		} else if (add === 'log') {
			// Opened from the home screen, a failure shows in the chooser, with the other choices.
			void logTraining().then(() => {
				if (loadFailed) chooserOpen = true;
			});
		}
	});

	async function pick(exercise: ExerciseSummary) {
		picked = exercise;
		await tick();
		round++;
		logOpen = true;
	}

	async function recorded(event: BehaviourEvent) {
		snack = {
			text: `Recorded ${eventPhrase(event.category, nameOf(event.dogId))}.`,
			href: resolve('/(app)/events/[id]', { id: event.id }),
			link: 'See the event'
		};
		await invalidateAll();
	}

	async function logged(log: SessionLog) {
		snack = {
			text: `Logged ${log.exercise.title} for ${nameOf(log.dogId) ?? 'your dog'}.`,
			href: resolve('/(app)/logs/[id]', { id: log.id }),
			link: 'See the log'
		};
		await invalidateAll();
	}

	const row =
		'flex min-h-14 w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3 text-left font-bold';
</script>

{#snippet choice(icon: IconName, label: string, onclick: () => void, detail?: string)}
	<li>
		<button type="button" class={row} {onclick} aria-haspopup="dialog">
			<Icon name={icon} size={24} class="text-primary" />
			<span class="flex flex-1 flex-col">
				{label}
				{#if detail}<span class="text-sm font-normal text-muted-foreground">{detail}</span>{/if}
			</span>
		</button>
	</li>
{/snippet}

{#if (dogs && current.length > 0) || snack}
	<!-- Room at the end of the page, so the button never covers its last card. -->
	<div class="h-20" aria-hidden="true"></div>
	<!-- Above the bottom bar, at the right edge of the app's column on a wide screen. -->
	<div
		class="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl flex-col items-end gap-3 px-4"
	>
		{#if snack}
			<div
				role="status"
				class="pointer-events-auto flex w-full items-center gap-2 rounded-2xl border border-border bg-card py-1 pr-1 pl-4 shadow-lg"
			>
				<span class="flex-1 py-2">{snack.text}</span>
				{#if snack.action}
					<Button variant="ghost" class="px-2 font-bold text-primary" onclick={snack.action.run}
						>{snack.action.label}</Button
					>
				{:else if snack.href}
					<!-- snack.href was resolved when it was set. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={snack.href}
						class="flex min-h-12 items-center px-2 font-bold text-primary underline">{snack.link}</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
				<Button variant="ghost" size="icon" aria-label="Dismiss" onclick={() => (snack = null)}>
					<Icon name="close" />
				</Button>
			</div>
		{/if}
		{#if dogs && current.length > 0}
			<Button
				size="icon"
				class="pointer-events-auto size-14 shadow-lg [&_svg:not([class*='size-'])]:size-7"
				aria-label="Add"
				aria-haspopup="dialog"
				onclick={() => {
					loadFailed = false;
					chooserOpen = true;
				}}
			>
				<Icon name="add" />
			</Button>
		{/if}
	</div>
{/if}

{#if dogs && current.length > 0}
	<Sheet.Root bind:open={chooserOpen}>
		<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-6">
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">Add</Sheet.Title>
				<Sheet.Description class="sr-only">Choose what to add.</Sheet.Description>
			</Sheet.Header>
			<ul class="flex flex-col gap-2">
				{#each order as kind (kind)}
					{#if kind === 'log'}
						{@render choice(
							'log',
							loading ? 'Opening the library…' : 'Log training',
							logTraining,
							'A practice, planned or not'
						)}
					{:else if kind === 'event'}
						{@render choice(
							'event',
							'Record event',
							() => next(() => (eventOpen = true)),
							'Barking, a visitor, an accident…'
						)}
					{:else if kind === 'care'}
						<li>
							<a href={resolve('/(app)/care/new')} class={row}>
								<Icon name="vaccination" size={24} class="text-primary" />
								<span class="flex flex-1 flex-col">
									Add care task
									<span class="text-sm font-normal text-muted-foreground"
										>A vaccination, deworming, a vet visit…</span
									>
								</span>
							</a>
						</li>
					{:else}
						<li>
							<!-- scheduleHref, when given, is resolved by the page. -->
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={scheduleHref ?? resolve('/(app)/plan/new')} class={row}>
								<Icon name="schedule" size={24} class="text-primary" />
								<span class="flex flex-1 flex-col">
									Schedule session
									<span class="text-sm font-normal text-muted-foreground">Plan one or a repeat</span
									>
								</span>
							</a>
						</li>
					{/if}
				{/each}
			</ul>
			{#if loadFailed}
				<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
					Couldn't open the library — check your connection.
				</p>
			{/if}
		</Sheet.Content>
	</Sheet.Root>

	{#key round}
		<EventSheet bind:open={eventOpen} {dogs} dogId={startDog} {timeZone} onfinished={recorded} />
		{#if exercises}
			<ExercisePicker bind:open={pickerOpen} {exercises} selected={null} onpick={pick} />
		{/if}
		{#if picked}
			<QuickLogSheet
				bind:open={logOpen}
				target={{
					kind: 'exercise',
					exercise: { id: picked.id, title: picked.title, minutes: picked.suggestedDurationMin }
				}}
				{dogs}
				dogId={startDog}
				{timeZone}
				onfinished={logged}
			/>
		{/if}
	{/key}
{/if}
