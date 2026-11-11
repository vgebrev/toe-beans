<script lang="ts">
	// A planned session (ui.md §4.1, §4.3, FR-05): which dog, which exercise, when, and how it
	// repeats. A planned one can be changed, skipped or cancelled; a repeating one asks whether
	// for this session only or this and the rest. Skipped and cancelled ones can be put back.
	// Neither counts as done. A change made elsewhere meanwhile changes nothing and says so above
	// the latest version (§5.2).
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { PlannedSession } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { createApiClient, type ApiError } from '#lib/api-client/index.js';
	import { dayName, dayPhrase, isoWeek, repeatSummary } from '#lib/planner/dates.js';
	import { statusLabels } from '#lib/planner/status.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const session = $derived(data.session);
	const dog = $derived(data.dogs?.find((d) => d.id === session?.dogId));
	const overdue = $derived(
		session?.status === 'planned' && new Date(session.scheduledAt) < new Date()
	);

	let notice = $state<string | null>(page.state.notice ?? null);
	let status = $state<'idle' | 'working' | 'failed' | 'signed-out'>('idle');
	let sheet = $state<'change' | 'cancel' | null>(null);
	let sheetOpen = $state(false);

	const planHref = (date: string) => `${resolve('/(app)/plan')}?week=${isoWeek(date)}&day=${date}`;
	const editHref = (scope: 'this' | 'following') =>
		`${resolve('/(app)/sessions/[id]/edit', { id: session!.id })}?scope=${scope}`;

	function open(which: 'change' | 'cancel') {
		status = 'idle';
		sheet = which;
		sheetOpen = true;
	}

	/** A 412 or 404 closes the sheet and reloads, saying what happened above the result. */
	async function failed(error: ApiError, what: string) {
		const code = error.kind === 'problem' ? error.problem.status : null;
		if (code === 412) {
			sheetOpen = false;
			await invalidateAll();
			notice = `${data.session?.updatedBy ?? 'Someone'} changed this a moment ago, so it wasn't ${what}. This is the latest version.`;
			status = 'idle';
		} else if (code === 404) {
			sheetOpen = false;
			notice = `This session was removed a moment ago, so it wasn't ${what}.`;
			status = 'idle';
		} else if (code === 401) status = 'signed-out';
		else status = 'failed';
	}

	async function setStatus(next: 'planned' | 'skipped' | 'cancelled', done: string, what: string) {
		if (!session || status === 'working') return;
		status = 'working';
		const result = await api.send('PATCH', `/planned-sessions/${session.id}`, {
			body: { status: next },
			ifMatch: session.etag,
			schema: PlannedSession
		});
		if (!result.ok) return failed(result.error, what);
		sheetOpen = false;
		status = 'idle';
		notice = done;
		await invalidateAll();
	}

	async function cancelFollowing() {
		if (!session?.plan || status === 'working') return;
		status = 'working';
		const result = await api.send('POST', `/training-plans/${session.plan.id}/end`, {
			body: { fromSessionId: session.id },
			ifMatch: session.plan.etag
		});
		if (!result.ok) return failed(result.error, 'cancelled');
		sheetOpen = false;
		status = 'idle';
		// The route is resolved; the query picks the week and day.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(planHref(session.date), {
			invalidateAll: true,
			state: {
				notice: `Cancelled ${session.exercise.title} from ${dayPhrase(session.date, data.today)} on.`
			}
		});
	}
</script>

<svelte:head><title>{session?.exercise.title ?? 'Session'} · Toe Beans</title></svelte:head>

<!-- planHref and editHref resolve the route; the rule can't see through the query string. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<PageHeader title={session?.exercise.title ?? 'Session'}>
	<a
		href={session ? planHref(session.date) : resolve('/(app)/plan')}
		class="flex min-h-12 items-center gap-1 self-start font-bold"
	>
		<Icon name="back" />
		Plan
	</a>
</PageHeader>

<div class="flex flex-col gap-6 px-4 pt-2 pb-8">
	<p aria-live="polite" class="rounded-2xl bg-soft px-4 py-3 empty:hidden">{notice ?? ''}</p>

	{#if !session}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this session — check your connection, then reload.
		</p>
	{:else}
		<dl class="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4">
			<div class="flex items-center gap-3">
				<dt class="sr-only">Dog</dt>
				<dd class="flex items-center gap-3 font-bold">
					{#if dog}<DogAvatar {dog} size={48} />{/if}
					{dog?.name ?? 'A dog no longer here'}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">When</dt>
				<dd class="font-bold">
					{dayName(session.date, data.today)} at {session.time}
					{#if overdue}<span class="ml-2 text-warn">Missed</span>{/if}
				</dd>
			</div>
			{#if session.plan}
				<div>
					<dt class="text-sm text-muted-foreground">Repeats</dt>
					<dd class="flex items-center gap-2 font-bold">
						<Icon name="repeat" size={20} />
						{repeatSummary(session.plan.days, session.plan.until)}
					</dd>
				</div>
			{/if}
			{#if session.status !== 'planned'}
				<div>
					<dt class="text-sm text-muted-foreground">Status</dt>
					<dd class="font-bold">
						{statusLabels[session.status]}
						<span class="font-normal text-muted-foreground">
							{session.status === 'completed' ? '· logged' : '· not counted as done'}
						</span>
					</dd>
				</div>
			{/if}
			<div>
				<dt class="text-sm text-muted-foreground">Last changed by</dt>
				<dd>{session.updatedBy}</dd>
			</div>
		</dl>

		<a
			href={resolve('/(app)/library/[id]', { id: session.exercise.id })}
			class="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 font-bold"
		>
			<span>
				See the instructions
				{#if session.exercise.minutes}
					<span class="font-normal text-muted-foreground">· {session.exercise.minutes} min</span>
				{/if}
			</span>
			<Icon name="forward" class="text-muted-foreground" />
		</a>

		{#if status === 'failed' && !sheetOpen}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't save — check your connection.
			</p>
		{:else if status === 'signed-out' && !sheetOpen}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				You've been signed out. Sign in again, then try again.
			</p>
		{/if}

		{#if session.status === 'planned'}
			<div class="flex flex-col gap-3">
				{#if session.plan}
					<Button aria-haspopup="dialog" onclick={() => open('change')}>
						<Icon name="edit" />
						Change
					</Button>
				{:else}
					<a href={editHref('this')} class={buttonVariants()}>
						<Icon name="edit" />
						Change
					</a>
				{/if}
				<Button
					variant="outline"
					disabled={status === 'working'}
					onclick={() => setStatus('skipped', 'Skipped. It won’t count as done.', 'skipped')}
				>
					<Icon name="skip" />
					{status === 'working' ? 'Saving…' : 'Skip this session'}
				</Button>
				<Button
					variant="ghost"
					class="text-destructive"
					aria-haspopup="dialog"
					onclick={() => open('cancel')}
				>
					<Icon name="close" />
					Cancel…
				</Button>
			</div>
		{:else if session.status === 'skipped' || session.status === 'cancelled'}
			<Button
				variant="outline"
				disabled={status === 'working'}
				onclick={() => setStatus('planned', 'Put back in the plan.', 'put back')}
			>
				<Icon name="restore" />
				{status === 'working' ? 'Saving…' : 'Put it back in the plan'}
			</Button>
		{/if}
	{/if}
</div>

{#if session}
	<Sheet.Root bind:open={sheetOpen}>
		<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
			{#if sheet === 'change' && session.plan}
				<Sheet.Header class="p-0 pr-12 text-left">
					<Sheet.Title class="font-display text-xl font-semibold"
						>Change which sessions?</Sheet.Title
					>
					<Sheet.Description class="text-base">
						It's part of a repeating plan: {repeatSummary(session.plan.days, session.plan.until)}.
					</Sheet.Description>
				</Sheet.Header>
				<a href={editHref('this')} class={buttonVariants({ variant: 'outline' })}
					>This session only</a
				>
				<a href={editHref('following')} class={buttonVariants({ variant: 'outline' })}
					>This and following</a
				>
			{:else if sheet === 'cancel'}
				<Sheet.Header class="p-0 pr-12 text-left">
					<Sheet.Title class="font-display text-xl font-semibold">
						Cancel {session.exercise.title}{session.plan
							? '?'
							: ` ${dayPhrase(session.date, data.today)}?`}
					</Sheet.Title>
					<Sheet.Description class="text-base">
						{session.plan
							? 'Cancel just this session, or this one and the rest of the plan. Cancelled sessions never count as done.'
							: 'It stays in the plan as cancelled, and never counts as done. You can put it back.'}
					</Sheet.Description>
				</Sheet.Header>
				{#if status === 'failed'}
					<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
						Couldn't cancel — check your connection.
					</p>
				{:else if status === 'signed-out'}
					<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
						You've been signed out. Sign in again, then try again.
					</p>
				{/if}
				<Button
					variant="destructive"
					disabled={status === 'working'}
					onclick={() => setStatus('cancelled', 'Cancelled. It won’t count as done.', 'cancelled')}
				>
					{status === 'working'
						? 'Cancelling…'
						: session.plan
							? 'This session only'
							: 'Cancel session'}
				</Button>
				{#if session.plan}
					<Button variant="destructive" disabled={status === 'working'} onclick={cancelFollowing}>
						{status === 'working' ? 'Cancelling…' : 'This and following'}
					</Button>
				{/if}
			{/if}
		</Sheet.Content>
	</Sheet.Root>
{/if}
<!-- eslint-enable svelte/no-navigation-without-resolve -->
