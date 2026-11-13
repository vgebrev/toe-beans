<script lang="ts">
	// The floating "+" on Today, Plan and History (ui.md §2.1): a chooser sheet with *Log
	// training* (J4: pick an exercise, then the quick log), *Record event* (J5) and *Schedule
	// session* (J3). *Add care task* joins it with S11. New records start with the switcher's dog.
	// Once one is saved, a snackbar says so with a link to it (§5.2), and the page reloads its
	// data so it shows up.
	import { tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
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
	}

	let { dogs, timeZone, scheduleHref }: Props = $props();

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
	let saved = $state<{ text: string; href: string; link: string } | null>(null);

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

	async function pick(exercise: ExerciseSummary) {
		picked = exercise;
		await tick();
		round++;
		logOpen = true;
	}

	async function recorded(event: BehaviourEvent) {
		saved = {
			text: `Recorded ${eventPhrase(event.category, nameOf(event.dogId))}.`,
			href: resolve('/(app)/events/[id]', { id: event.id }),
			link: 'See the event'
		};
		await invalidateAll();
	}

	async function logged(log: SessionLog) {
		saved = {
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

{#if dogs && current.length > 0}
	<!-- Room at the end of the page, so the button never covers its last card. -->
	<div class="h-20" aria-hidden="true"></div>
	<!-- Above the bottom bar, at the right edge of the app's column on a wide screen. -->
	<div
		class="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl flex-col items-end gap-3 px-4"
	>
		{#if saved}
			<div
				role="status"
				class="pointer-events-auto flex w-full items-center gap-2 rounded-2xl border border-border bg-card py-1 pr-1 pl-4 shadow-lg"
			>
				<span class="flex-1 py-2">{saved.text}</span>
				<!-- saved.href was resolved when it was saved. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={saved.href}
					class="flex min-h-12 items-center px-2 font-bold text-primary underline">{saved.link}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				<Button variant="ghost" size="icon" aria-label="Dismiss" onclick={() => (saved = null)}>
					<Icon name="close" />
				</Button>
			</div>
		{/if}
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
	</div>

	<Sheet.Root bind:open={chooserOpen}>
		<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-6">
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">Add</Sheet.Title>
				<Sheet.Description class="sr-only">Choose what to add.</Sheet.Description>
			</Sheet.Header>
			<ul class="flex flex-col gap-2">
				{@render choice(
					'log',
					loading ? 'Opening the library…' : 'Log training',
					logTraining,
					'A practice, planned or not'
				)}
				{@render choice(
					'event',
					'Record event',
					() => next(() => (eventOpen = true)),
					'Barking, a visitor, an accident…'
				)}
				<li>
					<!-- scheduleHref, when given, is resolved by the page. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={scheduleHref ?? resolve('/(app)/plan/new')} class={row}>
						<Icon name="schedule" size={24} class="text-primary" />
						<span class="flex flex-1 flex-col">
							Schedule session
							<span class="text-sm font-normal text-muted-foreground">Plan one or a repeat</span>
						</span>
					</a>
				</li>
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
