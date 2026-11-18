<script lang="ts">
	// Changing a care task (ui.md J6, FR-10): the same form as adding one. A new date goes into
	// the history as a move; the dog can be corrected to another current one. A change made
	// elsewhere meanwhile is never overwritten: the form offers their version.
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { CareTask } from '@toe-beans/contracts';
	import CareForm from '#lib/components/care/CareForm.svelte';
	import BackLink from '#lib/components/shell/BackLink.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { createApiClient, problemStatus } from '#lib/api-client/index.js';
	import {
		careBody,
		careOutcomeOf,
		valuesOf,
		type CareSaveOutcome,
		type CareValues
	} from '#lib/care/form.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const task = $derived(data.task);
	// Current dogs, and the task's own if it's been archived since, so it can stay put.
	const dogs = $derived((data.dogs ?? []).filter((d) => !d.archived || d.id === task?.dogId));
	const initial = $derived(task ? valuesOf(task) : null);
	/** Bumped after a conflict, so the form starts again from their version. */
	let round = $state(0);

	const gone: CareSaveOutcome = {
		kind: 'gone',
		message: 'This care task was removed a moment ago, so there’s nothing to save it to.'
	};

	async function save(values: CareValues): Promise<CareSaveOutcome> {
		if (!task || !initial) return { kind: 'failed' };
		const body = careBody(values, initial);
		if (Object.keys(body).length === 0) {
			return {
				kind: 'invalid',
				fields: {},
				message: "Nothing's changed, so there's nothing to save."
			};
		}
		const result = await api.send('PATCH', `/care-tasks/${task.id}`, {
			body,
			ifMatch: task.etag,
			schema: CareTask
		});
		if (!result.ok) {
			const code = problemStatus(result.error);
			if (code === 404) return gone;
			if (code === 412) {
				const latest = await api.get(`/care-tasks/${task.id}`, CareTask);
				if (!latest.ok) return { kind: 'failed' };
				return {
					kind: 'conflict',
					message: `${latest.data.updatedBy} changed this a moment ago, so nothing was saved.`
				};
			}
			return careOutcomeOf(result.error);
		}
		await goto(resolve('/(app)/care/[id]', { id: task.id }), {
			invalidateAll: true,
			state: { notice: 'Saved.' }
		});
		return { kind: 'saved' };
	}

	async function reload() {
		await invalidateAll();
		round++;
	}
</script>

<svelte:head><title>Change {task?.title ?? 'care task'} · Toe Beans</title></svelte:head>

<PageHeader title="Change care task">
	<BackLink
		href={task ? resolve('/(app)/care/[id]', { id: task.id }) : resolve('/(app)/care')}
		label={task?.title ?? 'Care'}
	/>
</PageHeader>

<div class="px-4 pt-2">
	{#if !task || !initial || data.dogs === null}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this care task — check your connection, then reload.
		</p>
	{:else}
		{#key round}
			<CareForm {dogs} {initial} submitLabel="Save" {save} onreload={reload} />
		{/key}
	{/if}
</div>
