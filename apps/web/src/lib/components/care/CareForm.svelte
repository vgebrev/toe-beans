<script lang="ts">
	// Adding or changing a care task (ui.md J6, §5.1, §5.2): the dog, what kind of care, a title
	// pre-filled from the kind until the person types their own, the date with an optional time in
	// 5-minute steps, and notes. Saving keeps everything typed on a failure; a change made
	// elsewhere offers the latest version, never an overwrite.
	import { untrack } from 'svelte';
	import type { CareCategory, Dog } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import {
		checkCare,
		defaultTitle,
		type CareField,
		type CareSaveOutcome,
		type CareValues
	} from '#lib/care/form.js';
	import { CARE_CATEGORIES, careLabels } from '#lib/care/labels.js';
	import { roundTime } from '#lib/planner/dates.js';
	import { revealErrors } from '#lib/forms/reveal-errors.js';

	interface Props {
		/** The household's dogs still here; the task's own dog too when editing, if archived. */
		dogs: Dog[];
		initial: CareValues;
		submitLabel: string;
		save: (values: CareValues) => Promise<CareSaveOutcome>;
		/** After a conflict, loads the latest version into a fresh form. */
		onreload?: () => void | Promise<void>;
	}

	let { dogs, initial, submitLabel, save, onreload }: Props = $props();

	let values = $state<CareValues>(untrack(() => structuredClone(initial)));
	/** The title follows the category until the person changes it. */
	let ownTitle = $state(
		untrack(() => initial.title !== '' && initial.title !== defaultTitle(initial.category))
	);
	let errors = $state<Partial<Record<CareField, string>>>({});
	let status = $state<'idle' | 'saving' | 'failed' | 'signed-out'>('idle');
	let problem = $state<{ kind: 'conflict' | 'gone' | 'invalid'; message: string } | null>(null);
	const busy = $derived(status === 'saving');
	const stuck = $derived(problem?.kind === 'conflict' || problem?.kind === 'gone');

	function clear(field: CareField) {
		errors = { ...errors, [field]: undefined };
		if (problem?.kind === 'invalid') problem = null;
	}

	function chooseCategory(category: CareCategory) {
		values.category = category;
		if (!ownTitle) values.title = defaultTitle(category);
		clear('category');
		clear('title');
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || stuck) return;
		if (values.dueTime) values.dueTime = roundTime(values.dueTime);
		errors = checkCare(values);
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

	const describedBy = (field: CareField, hint?: string) =>
		errors[field] ? `care-${field}-error` : hint;
	const pill =
		'flex min-h-12 cursor-pointer items-center gap-2 rounded-full border px-4 font-bold has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50';
</script>

{#snippet error(field: CareField)}
	{#if errors[field]}
		<p id="care-{field}-error" class="text-sm text-destructive">{errors[field]}</p>
	{/if}
{/snippet}

<form class="flex flex-col gap-6" onsubmit={submit} novalidate {@attach revealErrors}>
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
							pill,
							'px-1.5 pr-4',
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

	<fieldset class="flex flex-col gap-2" aria-describedby={describedBy('category')}>
		<legend class="mb-2 font-bold">What kind of care</legend>
		<div class="flex flex-wrap gap-2">
			{#each CARE_CATEGORIES as category (category)}
				<label
					class={[
						pill,
						values.category === category
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border'
					]}
				>
					<input
						type="radio"
						name="category"
						value={category}
						class="sr-only"
						checked={values.category === category}
						onchange={() => chooseCategory(category)}
					/>
					<Icon name={careLabels[category].icon} size={20} />
					{careLabels[category].label}
				</label>
			{/each}
		</div>
		{@render error('category')}
	</fieldset>

	<div class="flex flex-col gap-2">
		<Label for="care-title" class="font-bold">Title</Label>
		<Input
			id="care-title"
			maxlength={80}
			autocomplete="off"
			bind:value={values.title}
			oninput={() => {
				ownTitle = values.title.trim() !== '';
				clear('title');
			}}
			aria-invalid={errors.title ? 'true' : undefined}
			aria-describedby={describedBy('title', 'care-title-hint')}
		/>
		{#if errors.title}
			{@render error('title')}
		{:else}
			<p id="care-title-hint" class="text-sm text-muted-foreground">
				Like “Rabies booster” or “Deworming tablet”.
			</p>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-3">
		<div class="flex flex-col gap-2">
			<Label for="care-date" class="font-bold">Date</Label>
			<Input
				id="care-date"
				type="date"
				bind:value={values.dueDate}
				oninput={() => clear('dueDate')}
				aria-invalid={errors.dueDate ? 'true' : undefined}
				aria-describedby={describedBy('dueDate')}
			/>
			{@render error('dueDate')}
		</div>
		<div class="flex flex-col gap-2">
			<Label for="care-time" class="font-bold">
				Time <span class="font-normal text-muted-foreground">(optional)</span>
			</Label>
			<Input
				id="care-time"
				type="time"
				step={300}
				bind:value={values.dueTime}
				oninput={() => clear('dueTime')}
				onchange={() => (values.dueTime = values.dueTime ? roundTime(values.dueTime) : '')}
				aria-invalid={errors.dueTime ? 'true' : undefined}
				aria-describedby={describedBy('dueTime', 'care-time-hint')}
			/>
			{#if errors.dueTime}
				{@render error('dueTime')}
			{:else}
				<p id="care-time-hint" class="text-sm text-muted-foreground">
					For an appointment or a class.
				</p>
			{/if}
		</div>
	</div>

	<div class="flex flex-col gap-2">
		<Label for="care-notes" class="font-bold">
			Notes <span class="font-normal text-muted-foreground">(optional)</span>
		</Label>
		<Textarea
			id="care-notes"
			rows={3}
			maxlength={2000}
			bind:value={values.notes}
			oninput={() => clear('notes')}
			aria-invalid={errors.notes ? 'true' : undefined}
			aria-describedby={describedBy('notes', 'care-notes-hint')}
		/>
		{#if errors.notes}
			{@render error('notes')}
		{:else}
			<p id="care-notes-hint" class="text-sm text-muted-foreground">
				Which clinic, what to bring, the dose your vet gave.
			</p>
		{/if}
	</div>

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
		<Button type="submit" class="w-full" disabled={busy || stuck}>
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
