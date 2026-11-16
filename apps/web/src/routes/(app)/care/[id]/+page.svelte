<script lang="ts">
	// A care task (ui.md J6, FR-10, scenarios 5 and 7): which dog, what, when, notes and its
	// history. An upcoming one is marked done on a day (today by default), perhaps planning the
	// next one, changed, or cancelled; a done or cancelled one can be put back. Reminders follow by
	// themselves and the page says nothing about them (J6). A change made elsewhere meanwhile
	// changes nothing and says so above the latest version (§5.2).
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { CareTask } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { type ApiError, createApiClient, problemStatus } from '#lib/api-client/index.js';
	import { careLabels, duePhrase, historyLine, NEXT_CHOICES } from '#lib/care/labels.js';
	import { addMonths, dayName, dayPhrase, formatDate } from '#lib/planner/dates.js';
	import type { PageProps } from './$types';
	import { dogNameOf } from '#lib/dogs/name.js';

	let { data }: PageProps = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const task = $derived(data.task);
	const dog = $derived(data.dogs?.find((d) => d.id === task?.dogId));
	// Opened from History, the back link goes there (architecture D35).
	const fromHistory = $derived(page.url.searchParams.get('from') === 'history');

	let notice = $state<string | null>(page.state.notice ?? null);
	let status = $state<'idle' | 'working' | 'failed' | 'signed-out'>('idle');
	let sheet = $state<'complete' | 'cancel' | null>(null);
	let sheetOpen = $state(false);

	// Mark done: the day it was done, and whether to plan the next one.
	let completedOn = $state('');
	let next = $state<'none' | 1 | 3 | 12 | 'pick'>('none');
	let pickedDate = $state('');
	let fieldError = $state<{ field: 'completedOn' | 'next'; message: string } | null>(null);
	const nextDate = $derived(
		next === 'none' ? null : next === 'pick' ? pickedDate || null : addMonths(completedOn, next)
	);

	function open(which: 'complete' | 'cancel') {
		status = 'idle';
		fieldError = null;
		if (which === 'complete') {
			completedOn = data.today;
			next = 'none';
			pickedDate = '';
		}
		sheet = which;
		sheetOpen = true;
	}

	/** A 412, 404 or 409 closes the sheet and reloads, saying what happened above the result. */
	async function failed(error: ApiError, what: string) {
		const code = problemStatus(error);
		if (code === 400 && error.kind === 'problem') {
			const [key, messages] = Object.entries(error.problem.errors ?? {})[0] ?? [];
			fieldError = {
				field: key === 'completedOn' ? 'completedOn' : 'next',
				message: messages?.[0] ?? error.problem.title
			};
			status = 'idle';
		} else if (code === 412 || code === 409) {
			sheetOpen = false;
			await invalidateAll();
			notice =
				code === 409 && error.kind === 'problem'
					? `${error.problem.detail ?? 'This task changed a moment ago.'} Nothing was saved.`
					: `${data.task?.updatedBy ?? 'Someone'} changed this a moment ago, so it wasn't ${what}. This is the latest version.`;
			status = 'idle';
		} else if (code === 404) {
			sheetOpen = false;
			notice = `This care task was removed a moment ago, so it wasn't ${what}.`;
			status = 'idle';
		} else if (code === 401) status = 'signed-out';
		else status = 'failed';
	}

	async function complete() {
		if (!task || status === 'working') return;
		fieldError = null;
		if (!completedOn) {
			fieldError = { field: 'completedOn', message: 'Choose the day it was done.' };
			return;
		}
		if (next === 'pick' && !pickedDate) {
			fieldError = { field: 'next', message: 'Choose a date for the next one.' };
			return;
		}
		status = 'working';
		const result = await api.send('POST', `/care-tasks/${task.id}/complete`, {
			body: { completedOn, ...(nextDate && { next: { dueDate: nextDate } }) },
			ifMatch: task.etag,
			schema: CareTask
		});
		if (!result.ok) return failed(result.error, 'marked done');
		sheetOpen = false;
		status = 'idle';
		notice = nextDate
			? `Done. The next one is planned for ${dayPhrase(nextDate, data.today)}.`
			: 'Done.';
		await invalidateAll();
	}

	async function setStatus(nextStatus: 'upcoming' | 'cancelled', done: string, what: string) {
		if (!task || status === 'working') return;
		status = 'working';
		const result = await api.send('PATCH', `/care-tasks/${task.id}`, {
			body: { status: nextStatus },
			ifMatch: task.etag,
			schema: CareTask
		});
		if (!result.ok) return failed(result.error, what);
		sheetOpen = false;
		status = 'idle';
		notice = done;
		await invalidateAll();
	}

	const history = $derived([...(task?.history ?? [])].reverse());
	const pill =
		'flex min-h-12 cursor-pointer items-center rounded-full border px-4 font-bold has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50';
	const on = 'border-primary bg-primary text-primary-foreground';
</script>

<svelte:head><title>{task?.title ?? 'Care task'} · Toe Beans</title></svelte:head>

<PageHeader title={task?.title ?? 'Care task'}>
	<a
		href={fromHistory ? resolve('/(app)/history') : resolve('/(app)/care')}
		class="flex min-h-12 items-center gap-1 self-start font-bold"
	>
		<Icon name="back" />
		{fromHistory ? 'History' : 'Care'}
	</a>
</PageHeader>

<div class="flex flex-col gap-6 px-4 pt-2 pb-8">
	<p aria-live="polite" class="rounded-2xl bg-soft px-4 py-3 empty:hidden">{notice ?? ''}</p>

	{#if !task}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't load this care task — check your connection, then reload.
		</p>
	{:else}
		{#if task.status === 'cancelled'}
			<!-- Where a reminder tapped after the task was called off lands (ui.md J7). -->
			<div class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-4">
				<p class="font-bold">This care task was cancelled.</p>
				<Button href={resolve('/(app)')} variant="outline">Go to Today</Button>
			</div>
		{:else if dog?.archived}
			<p class="rounded-2xl border border-border bg-soft px-4 py-3">
				{dog.name} is archived, so this task is set aside: it's not on Care or Today and sends no reminders
				until {dog.name} is back.
			</p>
		{/if}

		<dl class="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-4">
			<div class="flex items-center gap-3">
				<dt class="sr-only">Dog</dt>
				<dd class="flex items-center gap-3 font-bold">
					{#if dog}<DogAvatar {dog} size={48} />{/if}
					{dogNameOf(dog)}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">What</dt>
				<dd class="flex items-center gap-2 font-bold">
					<Icon name={careLabels[task.category].icon} size={20} class="text-primary" />
					{careLabels[task.category].label}
				</dd>
			</div>
			<div>
				<dt class="text-sm text-muted-foreground">When</dt>
				<dd class="font-bold">
					{dayName(task.dueDate, data.today)}{task.dueTime ? ` at ${task.dueTime}` : ''}
					{#if task.overdue}<span class="ml-2 text-warn">Overdue</span>{/if}
				</dd>
			</div>
			{#if task.status === 'completed' && task.completedOn}
				<div>
					<dt class="text-sm text-muted-foreground">Done</dt>
					<dd class="font-bold">{dayName(task.completedOn, data.today)}</dd>
				</div>
			{/if}
			{#if task.notes}
				<div>
					<dt class="text-sm text-muted-foreground">Notes</dt>
					<dd class="whitespace-pre-line">{task.notes}</dd>
				</div>
			{/if}
			<div>
				<dt class="text-sm text-muted-foreground">Last changed by</dt>
				<dd>{task.updatedBy}</dd>
			</div>
		</dl>

		{#if status === 'failed' && !sheetOpen}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't save — check your connection.
			</p>
		{:else if status === 'signed-out' && !sheetOpen}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				You've been signed out. Sign in again, then try again.
			</p>
		{/if}

		{#if task.nextId}
			<a
				href={resolve('/(app)/care/[id]', { id: task.nextId })}
				class={buttonVariants({ variant: 'outline' })}
			>
				<Icon name="schedule" />
				See the next one
			</a>
		{/if}

		{#if task.status === 'upcoming'}
			<div class="flex flex-col gap-3">
				<Button aria-haspopup="dialog" onclick={() => open('complete')}>
					<Icon name="done" />
					Mark done
				</Button>
				<a
					href={resolve('/(app)/care/[id]/edit', { id: task.id })}
					class={buttonVariants({ variant: 'outline' })}
				>
					<Icon name="edit" />
					Change
				</a>
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
		{:else}
			<Button
				variant="outline"
				disabled={status === 'working'}
				onclick={() =>
					setStatus(
						'upcoming',
						`Put back as upcoming, ${duePhrase(task, data.today)}.`,
						'put back'
					)}
			>
				<Icon name="restore" />
				{status === 'working'
					? 'Saving…'
					: task.status === 'completed'
						? 'Not done after all'
						: 'Put it back'}
			</Button>
		{/if}

		{#if history.length > 0}
			<section aria-labelledby="care-history-heading" class="flex flex-col gap-3">
				<h2 id="care-history-heading" class="font-display text-lg font-semibold">History</h2>
				<ol class="flex flex-col gap-3 border-l-2 border-border pl-4">
					{#each history as entry, i (i)}
						<li class="flex flex-col">
							<span>{historyLine(entry)}</span>
							<span class="text-sm text-muted-foreground">
								{entry.by}, {formatDate(entry.at.slice(0, 10))}
							</span>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	{/if}
</div>

{#if task}
	<Sheet.Root bind:open={sheetOpen}>
		<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
			{#if sheet === 'complete'}
				<Sheet.Header class="p-0 pr-12 text-left">
					<Sheet.Title class="font-display text-xl font-semibold"
						>Mark {task.title} done</Sheet.Title
					>
					<Sheet.Description class="text-base">
						For {dog?.name ?? 'your dog'}. It stays on Care with its history.
					</Sheet.Description>
				</Sheet.Header>
				<div class="flex flex-col gap-2">
					<Label for="care-done-on" class="font-bold">Done on</Label>
					<Input
						id="care-done-on"
						type="date"
						max={data.today}
						bind:value={completedOn}
						oninput={() => (fieldError = null)}
						aria-invalid={fieldError?.field === 'completedOn' ? 'true' : undefined}
						aria-describedby={fieldError?.field === 'completedOn' ? 'care-done-error' : undefined}
					/>
					{#if fieldError?.field === 'completedOn'}
						<p id="care-done-error" class="text-sm text-destructive">{fieldError.message}</p>
					{/if}
				</div>
				<fieldset class="flex flex-col gap-2">
					<legend class="mb-2 font-bold">Plan the next one?</legend>
					<div class="grid grid-cols-2 gap-2">
						{#each [{ value: 'none' as const, label: 'Not now' }, ...NEXT_CHOICES.map( (c) => ({ value: c.months, label: c.label }) ), { value: 'pick' as const, label: 'Pick a date' }] as choice (choice.value)}
							<label class={[pill, 'justify-center', next === choice.value ? on : 'border-border']}>
								<input
									type="radio"
									name="next"
									class="sr-only"
									checked={next === choice.value}
									onchange={() => {
										next = choice.value;
										fieldError = null;
									}}
								/>
								{choice.label}
							</label>
						{/each}
					</div>
					{#if next === 'pick'}
						<Label for="care-next-date" class="pt-2 font-bold">Next one on</Label>
						<Input
							id="care-next-date"
							type="date"
							min={completedOn || data.today}
							bind:value={pickedDate}
							oninput={() => (fieldError = null)}
							aria-invalid={fieldError?.field === 'next' ? 'true' : undefined}
							aria-describedby={fieldError?.field === 'next' ? 'care-next-error' : undefined}
						/>
					{:else if nextDate}
						<p class="text-sm text-muted-foreground">
							The same {careLabels[task.category].label.toLowerCase()} for {dog?.name ??
								'your dog'}, {formatDate(nextDate)}.
						</p>
					{/if}
					{#if fieldError?.field === 'next'}
						<p id="care-next-error" class="text-sm text-destructive">{fieldError.message}</p>
					{/if}
				</fieldset>
				{#if status === 'failed'}
					<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
						Couldn't save — check your connection.
					</p>
				{:else if status === 'signed-out'}
					<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
						You've been signed out. Sign in again, then try again.
					</p>
				{/if}
				<Button disabled={status === 'working'} onclick={complete}>
					{#if status === 'working'}
						<Icon name="saving" class="animate-spin" />
						Saving…
					{:else if status === 'failed'}
						Retry
					{:else}
						Mark done
					{/if}
				</Button>
			{:else if sheet === 'cancel'}
				<Sheet.Header class="p-0 pr-12 text-left">
					<Sheet.Title class="font-display text-xl font-semibold">
						Cancel {task.title} for {dog?.name ?? 'your dog'}?
					</Sheet.Title>
					<Sheet.Description class="text-base">
						It stays on Care as cancelled, with its history. You can put it back.
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
					onclick={() => setStatus('cancelled', 'Cancelled.', 'cancelled')}
				>
					{status === 'working' ? 'Cancelling…' : 'Cancel care task'}
				</Button>
			{/if}
		</Sheet.Content>
	</Sheet.Root>
{/if}
