<script lang="ts">
	// Add care task (ui.md J6, FR-10, scenario 7): for one dog, starting with the switcher's.
	// Saved, it lands on Care, which says what was added.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { CareTask } from '@toe-beans/contracts';
	import CareForm from '#lib/components/care/CareForm.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { createApiClient } from '#lib/api-client/index.js';
	import { careBody, careOutcomeOf, type CareValues } from '#lib/care/form.js';
	import { duePhrase } from '#lib/care/labels.js';
	import { getActiveDog } from '#lib/dogs/active-dog.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const active = getActiveDog();
	const dogs = $derived((data.dogs ?? []).filter((d) => !d.archived));

	const initial = $derived<CareValues>({
		dogId: active.among(dogs)?.id ?? (dogs.length === 1 ? dogs[0]!.id : ''),
		category: null,
		title: '',
		dueDate: data.date,
		dueTime: '',
		notes: ''
	});

	async function save(values: CareValues) {
		const result = await api.send('POST', '/care-tasks', {
			body: careBody(values),
			schema: CareTask
		});
		if (!result.ok) return careOutcomeOf(result.error);
		const task = result.data;
		const dog = dogs.find((d) => d.id === task.dogId);
		await goto(resolve('/(app)/care'), {
			invalidateAll: true,
			state: {
				notice: `Added ${task.title} for ${dog?.name ?? 'your dog'}, ${duePhrase(task, data.today)}.`
			}
		});
		return { kind: 'saved' as const };
	}
</script>

<svelte:head><title>Add care task · Toe Beans</title></svelte:head>

<PageHeader title="Add care task">
	<a href={resolve('/(app)/care')} class="flex min-h-12 items-center gap-1 self-start font-bold">
		<Icon name="back" />
		Care
	</a>
</PageHeader>

<div class="px-4 pt-2">
	{#if data.dogs === null}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load your dogs — check your connection, then reload.
		</p>
	{:else if dogs.length === 0}
		<p class="text-muted-foreground">
			Add your dog first, then their care.
			<a href={resolve('/(app)/dogs/new')} class="font-bold text-primary underline">Add a dog</a>
		</p>
	{:else}
		{#key initial.dogId}
			<CareForm {dogs} {initial} submitLabel="Add care task" {save} />
		{/key}
	{/if}
</div>
