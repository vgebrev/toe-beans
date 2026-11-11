<script lang="ts">
	// Plan (ui.md §4.3, FR-05): a week strip, Monday to Sunday, with a dot on days that have
	// sessions and arrows to change week, then the chosen day's sessions in time order and
	// Schedule. A repeating session shows ↻; tapping one opens it to move, skip or cancel.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PlannedSession } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import SessionCard from '#lib/components/planner/SessionCard.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import {
		addDays,
		dayName,
		formatDate,
		isoWeek,
		isPlainDate,
		mondayOf,
		weekDates,
		weekdayNames,
		weekRange
	} from '#lib/planner/dates.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const active = getActiveDog();
	const dogs = $derived(data.dogs ?? []);
	const shownDogs = $derived(dogs.filter((d) => !d.archived));
	const selectedDog = $derived(active.among(shownDogs));

	const dates = $derived(weekDates(data.monday));
	const dayParam = $derived(page.url.searchParams.get('day'));
	const day = $derived(
		isPlainDate(dayParam) && mondayOf(dayParam) === data.monday
			? dayParam
			: dates.includes(data.today)
				? data.today
				: data.monday
	);
	const thisWeek = $derived(mondayOf(data.today) === data.monday);
	// The API plans up to a year ahead; no arrow leads past it.
	const lastMonday = $derived(mondayOf(addDays(data.today, 366 - 6)));

	const sessions = $derived(
		(data.sessions ?? []).filter((s) => !selectedDog || s.dogId === selectedDog.id)
	);
	const byDay = $derived(Map.groupBy(sessions, (s) => s.date));
	const busy = (date: string) =>
		(byDay.get(date) ?? []).some((s) => s.status === 'planned' || s.status === 'completed');
	const onDay = $derived(byDay.get(day) ?? []);
	const dogOf = (s: PlannedSession) => dogs.find((d) => d.id === s.dogId);
	// The device's clock, read once: a session from earlier today shows as missed.
	const now = new Date();
	const overdue = (s: PlannedSession) => s.status === 'planned' && new Date(s.scheduledAt) < now;

	const names = weekdayNames('short');
	const longNames = weekdayNames('long');

	/** Plan with a week and day in the query; `resolve` gives the route, the query is ours. */
	const planHref = (monday: string, date?: string) =>
		`${resolve('/(app)/plan')}?week=${isoWeek(monday)}${date ? `&day=${date}` : ''}`;
	const scheduleHref = $derived(
		`${resolve('/(app)/plan/new')}${day >= data.today ? `?date=${day}` : ''}`
	);
</script>

<svelte:head><title>Plan · Toe Beans</title></svelte:head>

<PageHeader title="Plan" switcher />

<div class="flex flex-col gap-5 px-4 pt-2">
	<p aria-live="polite" class="text-sm text-muted-foreground empty:hidden">
		{page.state.notice ?? ''}
	</p>

	<!-- planHref and scheduleHref resolve the route; the rule can't see through the query string. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<nav aria-label="Week" class="flex flex-col gap-3">
		<div class="flex items-center justify-between gap-2">
			<a
				href={planHref(addDays(data.monday, -7))}
				class="flex size-12 items-center justify-center rounded-full"
				aria-label="Previous week"
				data-sveltekit-noscroll
			>
				<Icon name="back" />
			</a>
			<div class="flex flex-col items-center">
				<h2 class="font-display text-xl font-semibold">{weekRange(data.monday)}</h2>
				{#if !thisWeek}
					<a href={resolve('/(app)/plan')} class="text-sm font-bold text-primary underline"
						>Back to this week</a
					>
				{/if}
			</div>
			{#if data.monday < lastMonday}
				<a
					href={planHref(addDays(data.monday, 7))}
					class="flex size-12 items-center justify-center rounded-full"
					aria-label="Next week"
					data-sveltekit-noscroll
				>
					<Icon name="forward" />
				</a>
			{:else}
				<span class="size-12"></span>
			{/if}
		</div>
		<ul class="grid grid-cols-7 gap-1">
			{#each dates as date, i (date)}
				{@const current = date === day}
				<li>
					<a
						href={planHref(data.monday, date)}
						aria-current={current ? 'date' : undefined}
						aria-label="{longNames[i]} {formatDate(date, { day: 'numeric', month: 'long' })}{busy(
							date
						)
							? ', has sessions'
							: ''}"
						data-sveltekit-noscroll
						data-sveltekit-replacestate
						class={[
							'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border',
							current ? 'border-primary bg-primary text-primary-foreground' : 'border-transparent',
							date === data.today && !current && 'border-border'
						]}
					>
						<span class="text-xs">{names[i]}</span>
						<span class="font-bold tabular-nums">{Number(date.slice(8))}</span>
						<span
							class={[
								'size-1.5 rounded-full',
								busy(date) ? (current ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent'
							]}
						></span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<section aria-labelledby="day-heading" class="flex flex-col gap-3">
		<h2 id="day-heading" class="font-display text-lg font-semibold">
			{dayName(day, data.today)}{day === data.today
				? `, ${formatDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}`
				: ''}
		</h2>
		{#if data.sessions === null}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't load the plan — check your connection, then reload.
			</p>
		{:else if onDay.length === 0}
			<EmptyState
				icon="plan"
				title="Nothing planned"
				text={day < data.today
					? 'Nothing was planned for this day.'
					: 'Plan a short session with one of the library’s exercises.'}
			/>
		{:else}
			<ul class="flex flex-col gap-3" aria-label="Sessions">
				{#each onDay as session (session.id)}
					<li><SessionCard {session} dog={dogOf(session)} overdue={overdue(session)} /></li>
				{/each}
			</ul>
		{/if}
		{#if shownDogs.length > 0}
			<a href={scheduleHref} class={buttonVariants({ class: 'w-full' })}>
				<Icon name="schedule" />
				Schedule
			</a>
		{:else if data.dogs}
			<p class="text-muted-foreground">
				Add your dog first, then plan their training here.
				<a href={resolve('/(app)/dogs/new')} class="font-bold text-primary underline">Add a dog</a>
			</p>
		{/if}
	</section>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</div>
