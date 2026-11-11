<script lang="ts">
	// Scheduling or changing a session (ui.md J3, §5.1, §5.2): the dog (when scheduling), the
	// exercise from a picker sheet, the date, the time in 5-minute steps, and how it repeats.
	// Saving keeps everything typed on a failure; a change made elsewhere offers the latest
	// version, never an overwrite (sessions aren't simple records like cues).
	import { untrack } from 'svelte';
	import type { Dog, ExerciseSummary } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { roundTime, weekdayNames } from '#lib/planner/dates.js';
	import {
		checkValues,
		type FieldName,
		type RepeatChoice,
		type SaveOutcome,
		type SessionValues
	} from '#lib/planner/form.js';
	import ExercisePicker from './ExercisePicker.svelte';

	interface Props {
		/** Scheduling anew, changing this session only, or this and the rest of its series. */
		mode: 'new' | 'this' | 'following';
		/** The household's dogs still here. */
		dogs: Dog[];
		exercises: ExerciseSummary[];
		today: string;
		initial: SessionValues;
		submitLabel: string;
		save: (values: SessionValues) => Promise<SaveOutcome>;
		/** After a conflict, loads the latest version into a fresh form. */
		onreload?: () => void | Promise<void>;
	}

	let { mode, dogs, exercises, today, initial, submitLabel, save, onreload }: Props = $props();

	let values = $state<SessionValues>(untrack(() => structuredClone(initial)));
	let errors = $state<Partial<Record<FieldName, string>>>({});
	let status = $state<'idle' | 'saving' | 'failed' | 'signed-out'>('idle');
	let problem = $state<{ kind: 'conflict' | 'gone' | 'invalid'; message: string } | null>(null);
	let pickerOpen = $state(false);

	const exercise = $derived(exercises.find((e) => e.id === values.exerciseId));
	const busy = $derived(status === 'saving');
	const repeats = $derived(mode !== 'this');
	const choices: { value: RepeatChoice; label: string }[] = $derived(
		[
			{ value: 'never' as const, label: 'Never' },
			{ value: 'daily' as const, label: 'Daily' },
			{ value: 'weekdays' as const, label: 'Weekdays' },
			{ value: 'custom' as const, label: 'Custom days' }
		].filter((c) => mode === 'new' || c.value !== 'never')
	);
	const names = weekdayNames('short');
	const longNames = weekdayNames('long');

	function clear(field: FieldName) {
		errors = { ...errors, [field]: undefined };
		if (problem?.kind === 'invalid') problem = null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || problem?.kind === 'conflict' || problem?.kind === 'gone') return;
		values.time = roundTime(values.time);
		errors = checkValues(values, today);
		if (Object.values(errors).some(Boolean)) return;
		status = 'saving';
		problem = null;
		const outcome = await save($state.snapshot(values));
		if (outcome.kind === 'saved') status = 'idle';
		else if (outcome.kind === 'invalid') {
			errors = outcome.fields;
			if (outcome.message) problem = { kind: 'invalid', message: outcome.message };
			status = 'idle';
		} else if (outcome.kind === 'conflict' || outcome.kind === 'gone') {
			problem = { kind: outcome.kind, message: outcome.message };
			status = 'idle';
		} else status = outcome.kind;
	}

	function toggleDay(day: number) {
		values.days = values.days.includes(day)
			? values.days.filter((d) => d !== day)
			: [...values.days, day];
		clear('days');
	}

	const describedBy = (field: FieldName, hint?: string) =>
		errors[field] ? `session-${field}-error` : hint;
	const chip = 'flex min-h-12 items-center justify-center rounded-full border px-4 font-bold';
	const on = 'border-primary bg-primary text-primary-foreground';
</script>

{#snippet error(field: FieldName)}
	{#if errors[field]}
		<p id="session-{field}-error" class="text-sm text-destructive">{errors[field]}</p>
	{/if}
{/snippet}

<form class="flex flex-col gap-6" onsubmit={submit} novalidate>
	{#if mode === 'new'}
		<fieldset class="flex flex-col gap-2" aria-describedby={describedBy('dogId')}>
			<legend class="mb-2 font-bold">Dog</legend>
			{#if dogs.length === 1}
				<p class="flex items-center gap-2 font-bold">
					<DogAvatar dog={dogs[0]!} size={36} />
					{dogs[0]!.name}
				</p>
			{:else}
				<div class="flex flex-wrap gap-2">
					{#each dogs as dog (dog.id)}
						<label
							class={[
								'flex min-h-12 cursor-pointer items-center gap-2 rounded-full border px-1.5 pr-4 font-bold has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
								values.dogId === dog.id ? 'border-primary bg-soft' : 'border-border'
							]}
						>
							<input
								type="radio"
								name="dog"
								value={dog.id}
								class="sr-only"
								bind:group={values.dogId}
								onchange={() => clear('dogId')}
							/>
							<DogAvatar {dog} size={36} ring={values.dogId === dog.id} />
							{dog.name}
						</label>
					{/each}
				</div>
			{/if}
			{@render error('dogId')}
		</fieldset>
	{/if}

	<div class="flex flex-col gap-2">
		<span id="session-exercise-label" class="font-bold">Exercise</span>
		<button
			type="button"
			aria-haspopup="dialog"
			aria-labelledby="session-exercise-label session-exercise-value"
			aria-describedby={describedBy('exerciseId')}
			class="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-input bg-card px-4 py-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
			onclick={() => (pickerOpen = true)}
		>
			<span id="session-exercise-value" class="flex min-w-0 flex-1 flex-col">
				{#if exercise}
					<span class="font-bold">{exercise.title}</span>
					<span class="text-sm text-muted-foreground">{exercise.suggestedDurationMin} min</span>
				{:else}
					<span class="text-muted-foreground">Choose from the library</span>
				{/if}
			</span>
			<Icon name="forward" class="shrink-0 text-muted-foreground" />
		</button>
		{@render error('exerciseId')}
	</div>

	<div class="grid grid-cols-2 gap-3">
		<div class="flex flex-col gap-2">
			<Label for="session-date" class="font-bold">
				{mode === 'following' || values.repeat !== 'never' ? 'First date' : 'Date'}
			</Label>
			<Input
				id="session-date"
				type="date"
				min={today}
				bind:value={values.date}
				oninput={() => clear('date')}
				aria-invalid={errors.date ? 'true' : undefined}
				aria-describedby={describedBy('date')}
			/>
			{@render error('date')}
		</div>
		<div class="flex flex-col gap-2">
			<Label for="session-time" class="font-bold">Time</Label>
			<Input
				id="session-time"
				type="time"
				step={300}
				bind:value={values.time}
				oninput={() => clear('time')}
				onchange={() => (values.time = roundTime(values.time))}
				aria-invalid={errors.time ? 'true' : undefined}
				aria-describedby={describedBy('time', 'session-time-hint')}
			/>
			{#if errors.time}
				{@render error('time')}
			{:else}
				<p id="session-time-hint" class="text-sm text-muted-foreground">In 5-minute steps.</p>
			{/if}
		</div>
	</div>

	{#if repeats}
		<fieldset class="flex flex-col gap-3">
			<legend class="mb-2 font-bold">Repeat</legend>
			<div class="grid grid-cols-2 gap-2">
				{#each choices as choice (choice.value)}
					<label
						class={[
							chip,
							'cursor-pointer has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
							values.repeat === choice.value ? on : 'border-border'
						]}
					>
						<input
							type="radio"
							name="repeat"
							value={choice.value}
							class="sr-only"
							bind:group={values.repeat}
							onchange={() => clear('days')}
						/>
						{choice.label}
					</label>
				{/each}
			</div>
			{#if values.repeat === 'custom'}
				<div
					role="group"
					aria-label="Days"
					aria-describedby={describedBy('days')}
					class="grid grid-cols-7 gap-1"
				>
					{#each names as name, i (name)}
						<button
							type="button"
							aria-pressed={values.days.includes(i + 1)}
							aria-label={longNames[i]}
							class={[
								'flex min-h-12 items-center justify-center rounded-full border text-sm font-bold',
								values.days.includes(i + 1) ? on : 'border-border'
							]}
							onclick={() => toggleDay(i + 1)}>{name}</button
						>
					{/each}
				</div>
				{@render error('days')}
			{/if}
			{#if values.repeat !== 'never'}
				<div class="flex flex-col gap-2">
					<Label for="session-until" class="font-bold">
						End date <span class="font-normal text-muted-foreground">(optional)</span>
					</Label>
					<Input
						id="session-until"
						type="date"
						min={values.date || today}
						bind:value={values.until}
						oninput={() => clear('until')}
						aria-invalid={errors.until ? 'true' : undefined}
						aria-describedby={describedBy('until', 'session-until-hint')}
					/>
					{#if errors.until}
						{@render error('until')}
					{:else}
						<p id="session-until-hint" class="text-sm text-muted-foreground">
							Leave it empty to keep going.
						</p>
					{/if}
				</div>
			{/if}
		</fieldset>
	{/if}

	<div class="flex flex-col gap-3 pb-4">
		{#if status === 'failed'}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't save — check your connection.
			</p>
		{:else if status === 'signed-out'}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				You've been signed out. Sign in again, then try again.
			</p>
		{:else if problem}
			<div
				role="alert"
				class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-3"
			>
				<p>{problem.message}</p>
				{#if problem.kind === 'conflict' && onreload}
					<Button type="button" variant="outline" onclick={onreload}>See their version</Button>
				{/if}
			</div>
		{/if}
		<Button
			type="submit"
			class="w-full"
			disabled={busy || problem?.kind === 'conflict' || problem?.kind === 'gone'}
		>
			{#if busy}
				<Icon name="saving" class="animate-spin" />
				Saving…
			{:else if status === 'failed'}
				Retry
			{:else}
				{submitLabel}
			{/if}
		</Button>
	</div>
</form>

<ExercisePicker
	bind:open={pickerOpen}
	{exercises}
	selected={values.exerciseId}
	onpick={(e) => {
		values.exerciseId = e.id;
		clear('exerciseId');
	}}
/>
