<script lang="ts">
	// History (ui.md §4.4, FR-08, FR-09): the household's logs, events and done care tasks in one
	// timeline, newest first, grouped by day; a care task heads the day it was done (D35). The switcher picks the dog; *Show*, *Exercise* and *Dates* are filter
	// buttons (§5.1) kept in the URL. A page at a time with *Load more*, not infinite scroll.
	// After a delete on a log's or event's page, the snackbar here offers *Undo* (J8). Back from a
	// log or event shows the list as it was, without asking again, unless this tab saved something
	// meanwhile; *Undo* puts the entry back in place.
	import { onMount, untrack } from 'svelte';
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import {
		BehaviourEvent,
		HistoryPage,
		SessionLog,
		type Dog,
		type HistoryEntry
	} from '@toe-beans/contracts';
	import FilterSheet from '#lib/components/filter/FilterSheet.svelte';
	import CareEntryCard from '#lib/components/history/CareEntryCard.svelte';
	import DateRangeSheet from '#lib/components/history/DateRangeSheet.svelte';
	import EventCard from '#lib/components/history/EventCard.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import ExercisePicker from '#lib/components/planner/ExercisePicker.svelte';
	import AddMenu, { type Snack } from '#lib/components/shell/AddMenu.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import LogCard from '#lib/components/training-log/LogCard.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { createApiClient, writeCount } from '#lib/api-client/index.js';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import { recordPath, type Deleted } from '#lib/history/deleted.js';
	import {
		anyFilter,
		DATE_PRESETS,
		filterQuery,
		presetDates,
		presetOf,
		readFilters,
		typeOptions,
		withFilters,
		type HistoryFilters
	} from '#lib/history/filters.js';
	import { dateOf, idOf, keepList, keptList, matches, placeEntry } from '#lib/history/timeline.js';
	import { dayName, formatDate } from '#lib/planner/dates.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const active = getActiveDog();
	const dogs = $derived(data.dogs ?? []);
	const current = $derived(dogs.filter((d) => !d.archived));
	// With one dog there's nothing to choose, and an archived dog's history still shows.
	const dogId = $derived(current.length > 1 ? (active.among(current)?.id ?? null) : null);
	const dogOf = (id: string): Dog | undefined => dogs.find((d) => d.id === id);

	const filters = $derived(readFilters(page.url.searchParams));
	const href = (change: Partial<HistoryFilters>) => {
		const query = filterQuery(withFilters(filters, change));
		return resolve('/(app)/history') + (query ? `?${query}` : '');
	};
	// The route is resolved in href; the query holds the filters.
	const show = (change: Partial<HistoryFilters>) =>
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(href(change), { replace: true, reset: false });

	/** What's asked for, the dog included; also the kept list's key. */
	const query = $derived(filterQuery(filters, dogId ? { dog: dogId } : {}));
	// Back to the list it left: what it had, so the browser can scroll to where it was.
	const kept = untrack(() =>
		navigating.type === 'popstate' ? keptList(query, writeCount()) : null
	);

	let entries = $state<HistoryEntry[]>(kept?.entries ?? []);
	let next = $state<string | undefined>(kept?.next);
	let status = $state<'loading' | 'ready' | 'failed' | 'more' | 'more-failed'>(
		kept ? 'ready' : 'loading'
	);
	/** Bumped on each fresh load, so an answer to an older one is dropped. */
	let generation = 0;

	async function load(cursor?: string) {
		const mine = cursor ? generation : ++generation;
		status = cursor ? 'more' : 'loading';
		const params = filterQuery(filters, {
			...(dogId && { dog: dogId }),
			...(cursor && { cursor })
		});
		const result = await api.get(`/history${params ? `?${params}` : ''}`, HistoryPage);
		if (mine !== generation) return;
		if (!result.ok) {
			status = cursor ? 'more-failed' : 'failed';
			return;
		}
		entries = cursor ? [...entries, ...result.data.entries] : result.data.entries;
		next = result.data.next;
		status = 'ready';
	}

	let restored = kept !== null;
	$effect(() => {
		void query;
		if (restored) restored = false;
		else untrack(() => load());
	});

	beforeNavigate(() => {
		if (status === 'loading' || status === 'failed') return;
		keepList({ key: query, entries: $state.snapshot(entries), next, writes: writeCount() });
	});

	// Consecutive entries on the same day, under one heading.
	const days = $derived(
		entries.reduce<{ date: string; entries: HistoryEntry[] }[]>((list, entry) => {
			const date = dateOf(entry);
			if (list.at(-1)?.date === date) list.at(-1)!.entries.push(entry);
			else list.push({ date, entries: [entry] });
			return list;
		}, [])
	);
	// With its year when that isn't this one.
	const heading = (date: string) => dayName(date, data.today);

	// The filters.
	const typeChoices = $derived(
		typeOptions.map((o) => ({ ...o, href: href({ type: o.id === 'all' ? null : o.id }) }))
	);
	const exerciseTitle = $derived(
		filters.exercise
			? (data.exercises?.find((e) => e.id === filters.exercise)?.title ?? filters.exercise)
			: 'All exercises'
	);
	let pickerOpen = $state(false);
	let datesOpen = $state(false);
	let datesRound = $state(0);
	const preset = $derived(presetOf(filters, data.today));
	const rangeLabel = $derived.by(() => {
		const day = (d: string) =>
			formatDate(d, { day: 'numeric', month: 'short' }, undefined, data.today);
		if (filters.from && filters.to) {
			return filters.from === filters.to
				? day(filters.from)
				: `${day(filters.from)} – ${day(filters.to)}`;
		}
		if (filters.from) return `From ${day(filters.from)}`;
		if (filters.to) return `Until ${day(filters.to)}`;
		return 'Choose dates…';
	});
	const dateChoices = $derived([
		{ id: 'all', label: 'All time', href: href({ from: null, to: null }) },
		...DATE_PRESETS.map((p) => ({
			id: p.id,
			label: p.label,
			href: href(presetDates(p.days, data.today))
		})),
		{ id: 'custom', label: preset === null ? rangeLabel : 'Choose dates…' }
	]);

	// The snackbar: *Undo* after a delete, or what a detail page had to say.
	let snack = $state<Snack | null>(null);

	async function undo(deleted: Deleted) {
		snack = { text: 'Bringing it back…' };
		const result =
			deleted.kind === 'log'
				? await api.send('POST', `${recordPath(deleted)}/restore`, {
						ifMatch: deleted.etag,
						schema: SessionLog
					})
				: await api.send('POST', `${recordPath(deleted)}/restore`, {
						ifMatch: deleted.etag,
						schema: BehaviourEvent
					});
		if (result.ok) {
			snack = {
				text: deleted.kind === 'log' ? 'The log is back.' : 'The event is back.',
				href:
					deleted.kind === 'log'
						? resolve('/(app)/logs/[id]', { id: deleted.id })
						: resolve('/(app)/events/[id]', { id: deleted.id }),
				link: deleted.kind === 'log' ? 'See the log' : 'See the event'
			};
			const entry: HistoryEntry =
				'practisedAt' in result.data
					? { kind: 'training', log: result.data }
					: { kind: 'event', event: result.data };
			// A list still loading may or may not have it, so ask again; else put it in place.
			if (status === 'loading' || status === 'failed') await load();
			else if (matches(entry, filters, dogId)) {
				entries = placeEntry(entries, entry, next !== undefined);
			}
			return;
		}
		const problem = result.error.kind === 'problem' ? result.error.problem : null;
		if (problem?.status === 409) snack = { text: problem.detail ?? "It can't come back now." };
		else if (problem?.status === 412 || problem?.status === 404) {
			snack = { text: "It can't come back now: it changed after it was deleted." };
		} else if (problem?.status === 401) {
			snack = { text: "You've been signed out. Sign in again to undo." };
		} else {
			snack = {
				text: "Couldn't undo — check your connection.",
				action: { label: 'Retry', run: () => undo(deleted) }
			};
		}
	}

	onMount(() => {
		const { deleted, notice } = page.state;
		if (deleted)
			snack = { text: deleted.text, action: { label: 'Undo', run: () => undo(deleted) } };
		else if (notice) snack = { text: notice };
		// Once shown, Back to this page shouldn't offer it again.
		if (deleted || notice) replaceState('', {});
	});
</script>

<svelte:head><title>History · Toe Beans</title></svelte:head>

<PageHeader title="History" switcher />

<div class="flex flex-col gap-4 px-4 pt-2 pb-4">
	<div class="flex flex-wrap gap-2">
		<FilterSheet title="Show" options={typeChoices} selected={filters.type ?? 'all'} />
		<button
			type="button"
			aria-haspopup="dialog"
			class="flex min-h-12 max-w-full items-center gap-2 rounded-full border border-border bg-card px-4 font-bold"
			onclick={() => (pickerOpen = true)}
			disabled={!data.exercises}
		>
			<span class="sr-only">Exercise: </span>
			<span class="min-w-0 truncate">{exerciseTitle}</span>
			<Icon name="expand" size={20} class="shrink-0 text-muted-foreground" />
		</button>
		<FilterSheet
			title="Dates"
			options={dateChoices}
			selected={preset ?? 'custom'}
			onselect={() => {
				datesRound++;
				datesOpen = true;
			}}
		/>
	</div>

	{#if status === 'loading'}
		<div class="flex flex-col gap-2" aria-busy="true" aria-label="Loading your history">
			{#each [0, 1, 2] as i (i)}
				<div class="h-16 animate-pulse rounded-2xl bg-soft"></div>
			{/each}
		</div>
	{:else if status === 'failed'}
		<div
			role="alert"
			class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-3"
		>
			<p>Couldn't load your history — check your connection.</p>
			<Button variant="outline" class="self-start" onclick={() => load()}>Try again</Button>
		</div>
	{:else if entries.length === 0}
		{#if anyFilter(filters)}
			<EmptyState
				icon="history"
				title="Nothing here"
				text="Nothing matches these filters{dogId ? ` for ${dogOf(dogId)?.name}` : ''}."
			/>
			<a
				href={resolve('/(app)/history')}
				data-sveltekit-replacestate
				class="flex min-h-12 items-center self-center font-bold text-primary underline"
				>Clear filters</a
			>
		{:else}
			<EmptyState
				icon="history"
				title="No history yet"
				text="Logged sessions, notable moments and care done will build up here."
			/>
		{/if}
	{:else}
		{#each days as day (day.date)}
			<section aria-labelledby="day-{day.date}" class="flex flex-col gap-2">
				<h2 id="day-{day.date}" class="pt-2 font-display text-lg font-semibold">
					{heading(day.date)}
				</h2>
				<ul class="flex flex-col gap-2">
					{#each day.entries as entry (idOf(entry))}
						<li>
							{#if entry.kind === 'training'}
								<LogCard log={entry.log} dog={dogOf(entry.log.dogId)} />
							{:else if entry.kind === 'care'}
								<CareEntryCard task={entry.task} dog={dogOf(entry.task.dogId)} />
							{:else}
								<EventCard event={entry.event} dog={dogOf(entry.event.dogId)} />
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		{#if status === 'more-failed'}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't load more — check your connection.
			</p>
		{/if}
		{#if next}
			<Button
				variant="outline"
				class="w-full"
				disabled={status === 'more'}
				onclick={() => load(next)}
			>
				{#if status === 'more'}
					<Icon name="saving" class="animate-spin" />
					Loading…
				{:else if status === 'more-failed'}
					Try again
				{:else}
					Load more
				{/if}
			</Button>
		{/if}
	{/if}
</div>

{#if data.exercises}
	<ExercisePicker
		bind:open={pickerOpen}
		title="Exercise"
		exercises={data.exercises}
		selected={filters.exercise}
		onpick={(exercise) => show({ exercise: exercise.id })}
		all={{ label: 'All exercises', onpick: () => show({ exercise: null }) }}
	/>
{/if}
{#key datesRound}
	<DateRangeSheet
		bind:open={datesOpen}
		from={filters.from}
		to={filters.to}
		today={data.today}
		onchoose={(dates) => show(dates)}
	/>
{/key}

<AddMenu dogs={data.dogs} timeZone={data.household.timeZone} bind:snack />
