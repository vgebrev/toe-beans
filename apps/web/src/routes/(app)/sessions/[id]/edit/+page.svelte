<script lang="ts">
	// Changing a session (ui.md §4.3, FR-05): this session only (its exercise, date and time), or
	// this and the rest of its series (also how it repeats), which starts a new series from here.
	// A change made elsewhere meanwhile is never overwritten: the form offers their version.
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { PlannedSession } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import SessionForm from '#lib/components/planner/SessionForm.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { createApiClient } from '#lib/api-client/index.js';
	import {
		outcomeOf,
		repeatBody,
		repeatChoice,
		type SaveOutcome,
		type SessionValues
	} from '#lib/planner/form.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const session = $derived(data.session);
	const dogs = $derived((data.dogs ?? []).filter((d) => !d.archived));
	const following = $derived(data.scope === 'following' && session?.plan !== undefined);

	const initial = $derived<SessionValues | null>(
		session &&
			(following && session.plan
				? {
						dogId: session.dogId,
						exerciseId: session.plan.exerciseId,
						date: session.date,
						time: session.plan.time,
						repeat: repeatChoice(session.plan.days),
						days: session.plan.days,
						until: session.plan.until ?? ''
					}
				: {
						dogId: session.dogId,
						exerciseId: session.exercise.id,
						date: session.date,
						time: session.time,
						repeat: 'never',
						days: [],
						until: ''
					})
	);

	const gone: SaveOutcome = {
		kind: 'gone',
		message: 'This session was removed a moment ago, so there’s nothing to save it to.'
	};

	async function conflict(): Promise<SaveOutcome> {
		const latest = await api.get(`/planned-sessions/${session!.id}`, PlannedSession);
		if (!latest.ok) {
			const code = latest.error.kind === 'problem' ? latest.error.problem.status : null;
			return code === 404 ? gone : { kind: 'failed' };
		}
		return {
			kind: 'conflict',
			message: following
				? 'This plan was changed somewhere else a moment ago, so nothing was saved.'
				: `${latest.data.updatedBy} changed this a moment ago, so nothing was saved.`
		};
	}

	async function save(values: SessionValues): Promise<SaveOutcome> {
		if (!session || !initial) return { kind: 'failed' };
		const result =
			following && session.plan
				? await api.send('PATCH', `/training-plans/${session.plan.id}`, {
						body: {
							fromSessionId: session.id,
							exerciseId: values.exerciseId,
							date: values.date,
							time: values.time,
							repeat: repeatBody(values)
						},
						ifMatch: session.plan.etag,
						schema: PlannedSession
					})
				: await (() => {
						// Only what changed, so an overdue session can change its exercise without moving.
						const body = {
							...(values.exerciseId !== initial.exerciseId && { exerciseId: values.exerciseId }),
							...(values.date !== initial.date && { date: values.date }),
							...(values.time !== initial.time && { time: values.time })
						};
						if (Object.keys(body).length === 0) return null;
						return api.send('PATCH', `/planned-sessions/${session.id}`, {
							body,
							ifMatch: session.etag,
							schema: PlannedSession
						});
					})();
		if (result === null) {
			return {
				kind: 'invalid',
				fields: {},
				message: "Nothing's changed, so there's nothing to save."
			};
		}
		if (!result.ok) {
			const code = result.error.kind === 'problem' ? result.error.problem.status : null;
			if (code === 412) return conflict();
			if (code === 404) return gone;
			if (code === 409) {
				return { kind: 'gone', message: 'This session has been logged, so it can’t be changed.' };
			}
			return outcomeOf(result.error);
		}
		await goto(resolve('/(app)/sessions/[id]', { id: result.data.id }), {
			invalidateAll: true,
			state: { notice: following ? 'Saved this and the following sessions.' : 'Saved.' }
		});
		return { kind: 'saved' };
	}
</script>

<svelte:head><title>Change session · Toe Beans</title></svelte:head>

<PageHeader title={following ? 'Change this and following' : 'Change this session'}>
	<a
		href={session ? resolve('/(app)/sessions/[id]', { id: session.id }) : resolve('/(app)/plan')}
		class="flex min-h-12 items-center gap-1 self-start font-bold"
	>
		<Icon name="back" />
		Session
	</a>
</PageHeader>

<div class="px-4 pt-2">
	{#if !session || !initial || data.exercises === null}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this session — check your connection, then reload.
		</p>
	{:else if session.status !== 'planned'}
		<p class="rounded-2xl border border-border bg-soft px-4 py-3">
			{session.status === 'completed'
				? 'This session has been logged, so it can’t be changed.'
				: `This session is ${session.status}. Put it back in the plan to change it.`}
		</p>
	{:else}
		{#key `${session.etag}${session.plan?.etag ?? ''}`}
			<SessionForm
				mode={following ? 'following' : 'this'}
				{dogs}
				exercises={data.exercises}
				today={data.today}
				{initial}
				submitLabel="Save"
				{save}
				onreload={() => invalidateAll()}
			/>
		{/key}
	{/if}
</div>
