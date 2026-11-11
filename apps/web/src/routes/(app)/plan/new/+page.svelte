<script lang="ts">
	// Schedule (ui.md J3, FR-05): a session for one dog, once or repeating. Saved, it lands on Plan
	// on the session's day, which says what was planned.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { PlannedSession } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import SessionForm from '#lib/components/planner/SessionForm.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { createApiClient } from '#lib/api-client/index.js';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import { dayPhrase, isoWeek } from '#lib/planner/dates.js';
	import { outcomeOf, repeatBody, type SessionValues } from '#lib/planner/form.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const active = getActiveDog();
	const dogs = $derived((data.dogs ?? []).filter((d) => !d.archived));
	const known = (id: string | null) => data.exercises?.some((e) => e.id === id) ?? false;

	const initial = $derived<SessionValues>({
		dogId: active.among(dogs)?.id ?? '',
		exerciseId: known(data.exerciseId) ? data.exerciseId : null,
		date: data.date,
		time: '',
		repeat: 'never',
		days: [],
		until: ''
	});

	async function save(values: SessionValues) {
		const result = await api.send('POST', '/planned-sessions', {
			body: {
				dogId: values.dogId,
				exerciseId: values.exerciseId,
				date: values.date,
				time: values.time,
				repeat: repeatBody(values)
			},
			schema: PlannedSession
		});
		if (!result.ok) return outcomeOf(result.error);
		const session = result.data;
		const dog = dogs.find((d) => d.id === session.dogId);
		const when = `${dayPhrase(session.date, data.today)} at ${session.time}`;
		// The route is resolved; the query picks the week and day.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(`${resolve('/(app)/plan')}?week=${isoWeek(session.date)}&day=${session.date}`, {
			invalidateAll: true,
			state: {
				notice: `Planned ${session.exercise.title} for ${dog?.name ?? 'your dog'}, ${session.plan ? 'starting ' : ''}${when}.`
			}
		});
		return { kind: 'saved' as const };
	}
</script>

<svelte:head><title>Schedule · Toe Beans</title></svelte:head>

<PageHeader title="Schedule">
	<a href={resolve('/(app)/plan')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		Plan
	</a>
</PageHeader>

<div class="px-4 pt-2">
	{#if data.exercises === null || data.dogs === null}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load the library — check your connection, then reload.
		</p>
	{:else if dogs.length === 0}
		<p class="text-muted-foreground">
			Add your dog first, then plan their training.
			<a href={resolve('/(app)/dogs/new')} class="font-bold text-primary underline">Add a dog</a>
		</p>
	{:else}
		{#key initial.dogId}
			<SessionForm
				mode="new"
				{dogs}
				exercises={data.exercises}
				today={data.today}
				{initial}
				submitLabel="Schedule"
				{save}
			/>
		{/key}
	{/if}
</div>
