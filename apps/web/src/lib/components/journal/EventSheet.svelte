<script lang="ts">
	// Recording an event (ui.md J5, FR-08, scenario 6): something notable with one dog, outside
	// training. The dog (the switcher's, or the only one), what happened, when (*Now* unless
	// changed), then the trigger, how the puppy responded and notes, all optional. The same sheet
	// edits an event (J8), when the dog can be corrected too. Saving follows §5.2: what's entered
	// survives a failure, and a change made elsewhere is never overwritten; *See their version*
	// loads it.
	import { untrack } from 'svelte';
	import { BehaviourEvent, type Dog, type EventCategory } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { createApiClient, type ApiError } from '#lib/api-client/index.js';
	import { CATEGORIES, categoryLabels } from '#lib/journal/labels.js';
	import { practisedAt, whenLabels, zonedParts, type WhenChoice } from '#lib/training-log/when.js';
	import { revealErrors } from '#lib/forms/reveal-errors.js';

	interface Props {
		open: boolean;
		/** An event to edit; a new one when left out. */
		event?: BehaviourEvent | null | undefined;
		/** The household's dogs, archived ones too, so an event can name its dog. */
		dogs: readonly Dog[];
		/** The dog to start with for a new event: the switcher's. */
		dogId?: string | null | undefined;
		timeZone: string;
		/** Once it's saved. The sheet has closed. */
		onfinished: (event: BehaviourEvent) => void | Promise<void>;
	}

	let {
		open = $bindable(),
		event = null,
		dogs,
		dogId = null,
		timeZone,
		onfinished
	}: Props = $props();

	const api = createApiClient((input, init) => fetch(input, init));

	// The sheet is remounted each time it opens, so it starts from what it was given.
	const initialEvent = untrack(() => event);
	const editing = initialEvent !== null;
	// Current dogs, plus an archived dog the event already belongs to, so editing can keep it.
	const choosable = untrack(() => dogs.filter((d) => !d.archived || d.id === initialEvent?.dogId));

	interface Values {
		dogId: string | null;
		category: EventCategory | null;
		when: WhenChoice;
		date: string;
		time: string;
		trigger: string;
		response: string;
		notes: string;
	}

	function valuesOf(from: BehaviourEvent | null): Values {
		const at = zonedParts(from ? new Date(from.occurredAt) : new Date(), timeZone);
		const start = untrack(() => dogId);
		return {
			dogId:
				from?.dogId ??
				(choosable.some((d) => d.id === start) ? start : null) ??
				(choosable.length === 1 ? choosable[0]!.id : null),
			category: from?.category ?? null,
			when: from ? 'earlier' : 'now',
			date: at.date,
			time: at.time,
			trigger: from?.trigger ?? '',
			response: from?.response ?? '',
			notes: from?.notes ?? ''
		};
	}

	let base = $state<BehaviourEvent | null>(initialEvent);
	let values = $state(valuesOf(initialEvent));
	let status = $state<'idle' | 'saving' | 'failed' | 'signed-out' | 'conflict' | 'theirs' | 'gone'>(
		'idle'
	);
	let theirs = $state<BehaviourEvent | null>(null);
	type Field = 'dogId' | 'category' | 'when' | 'trigger' | 'response' | 'notes';
	let errors = $state<Partial<Record<Field, string>>>({});

	const busy = $derived(status === 'saving');
	const dog = $derived(dogs.find((d) => d.id === values.dogId));

	function check(): boolean {
		const next: typeof errors = {};
		if (!values.dogId) next.dogId = 'Choose which dog it was.';
		if (!values.category) next.category = 'Choose what happened.';
		if (values.when === 'earlier' && (!values.date || !values.time)) {
			next.when = 'Choose the date and time.';
		}
		errors = next;
		return Object.keys(next).length === 0;
	}

	const optional = (v: string) => (v.trim() === '' ? null : v);

	function body() {
		// An edit sends the time only when it was changed, so saving keeps the recorded instant.
		const recorded = base && zonedParts(new Date(base.occurredAt), timeZone);
		const moved = !recorded || recorded.date !== values.date || recorded.time !== values.time;
		const at = moved ? practisedAt(values.when, values, timeZone) : undefined;
		const text = {
			trigger: optional(values.trigger),
			response: optional(values.response),
			notes: optional(values.notes)
		};
		const subject = { dogId: values.dogId, category: values.category };
		if (editing) return { ...subject, ...text, ...(at && { occurredAt: at }) };
		// Unset details are left out of a new event rather than sent as null.
		const set = Object.fromEntries(Object.entries(text).filter(([, v]) => v !== null));
		return { ...subject, ...set, ...(at && { occurredAt: at }) };
	}

	async function save(e?: SubmitEvent) {
		e?.preventDefault();
		if (busy || !check()) return;
		status = 'saving';
		const result = base
			? await api.send('PATCH', `/behaviour-events/${base.id}`, {
					body: body(),
					ifMatch: base.etag,
					schema: BehaviourEvent
				})
			: await api.send('POST', '/behaviour-events', { body: body(), schema: BehaviourEvent });
		if (result.ok) {
			status = 'idle';
			open = false;
			await onfinished(result.data);
			return;
		}
		await failed(result.error);
	}

	async function failed(error: ApiError) {
		if (error.kind === 'problem') {
			const { status: code, errors: fields } = error.problem;
			if (code === 400 && fields) {
				errors = {
					dogId: fields['dogId']?.[0],
					category: fields['category']?.[0],
					when: fields['occurredAt']?.[0],
					trigger: fields['trigger']?.[0],
					response: fields['response']?.[0],
					notes: fields['notes']?.[0]
				};
				status = 'idle';
				return;
			}
			if (code === 401) {
				status = 'signed-out';
				return;
			}
			if (code === 404) {
				status = 'gone';
				return;
			}
			if (code === 412 && base) return conflicted();
		}
		status = 'failed';
	}

	async function conflicted() {
		const latest = await api.get(`/behaviour-events/${base!.id}`, BehaviourEvent);
		if (latest.ok) {
			theirs = latest.data;
			status = 'conflict';
			return;
		}
		const gone = latest.error.kind === 'problem' && latest.error.problem.status === 404;
		status = gone ? 'gone' : 'failed';
	}

	function seeTheirs() {
		if (!theirs) return;
		base = theirs;
		values = valuesOf(theirs);
		errors = {};
		theirs = null;
		status = 'theirs';
	}

	function edited(field?: Field) {
		if (field) errors = { ...errors, [field]: undefined };
		if (status === 'theirs') status = 'idle';
	}

	const chip =
		'flex min-h-12 items-center justify-center rounded-full border px-4 text-sm font-bold';
	const chipState = (on: boolean) =>
		on
			? 'border-primary bg-primary text-primary-foreground'
			: 'border-input bg-background text-foreground';
	const noticeClass = 'rounded-2xl border border-border bg-soft px-4 py-3 text-base';
</script>

{#snippet alerts()}
	{#if status === 'failed'}
		<p role="alert" class={noticeClass}>Couldn't save — check your connection.</p>
	{:else if status === 'signed-out'}
		<p role="alert" class={noticeClass}>You've been signed out. Sign in again, then try again.</p>
	{:else if status === 'gone'}
		<p role="alert" class={noticeClass}>
			{editing ? 'This event was deleted a moment ago.' : 'That dog isn’t available any more.'}
		</p>
	{:else if status === 'conflict' && theirs}
		<div role="alert" class="flex flex-col gap-3 {noticeClass}">
			<p>{theirs.updatedBy} changed this a moment ago.</p>
			<Button type="button" variant="outline" onclick={seeTheirs}>See their version</Button>
		</div>
	{/if}
{/snippet}

{#snippet text(
	field: 'trigger' | 'response' | 'notes',
	label: string,
	hint: string,
	max: number,
	multiline: boolean
)}
	<div class="flex flex-col gap-2">
		<Label for="event-{field}" class="font-bold">
			{label} <span class="font-normal text-muted-foreground">(optional)</span>
		</Label>
		<p id="event-{field}-hint" class="-mt-1 text-sm text-muted-foreground">{hint}</p>
		{#if multiline}
			<Textarea
				id="event-{field}"
				class="min-h-16"
				maxlength={max}
				bind:value={values[field]}
				oninput={() => edited(field)}
				aria-invalid={errors[field] ? 'true' : undefined}
				aria-describedby={errors[field] ? `event-${field}-error` : `event-${field}-hint`}
			/>
		{:else}
			<Input
				id="event-{field}"
				autocomplete="off"
				maxlength={max}
				bind:value={values[field]}
				oninput={() => edited(field)}
				aria-invalid={errors[field] ? 'true' : undefined}
				aria-describedby={errors[field] ? `event-${field}-error` : `event-${field}-hint`}
			/>
		{/if}
		{#if errors[field]}
			<p id="event-{field}-error" class="text-sm text-destructive">{errors[field]}</p>
		{/if}
	</div>
{/snippet}

<Sheet.Root bind:open>
	<!-- The person may only need the chips and Save; raising the keyboard would cover them. -->
	<Sheet.Content
		side="bottom"
		onOpenAutoFocus={(e) => e.preventDefault()}
		class="mx-auto flex max-h-[92dvh] max-w-xl flex-col gap-4 overflow-y-auto px-4 pt-6 pb-0"
	>
		<Sheet.Header class="p-0 pr-12 text-left">
			<Sheet.Title class="font-display text-xl font-semibold">
				{editing ? 'Edit event' : 'Record event'}
			</Sheet.Title>
			<Sheet.Description class="flex items-center gap-2 text-base text-foreground">
				{#if dog && choosable.length === 1}
					<DogAvatar {dog} size={28} />
					<span class="font-bold">{dog.name}</span>
				{:else}
					Something notable, no training needed.
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		<form class="flex flex-col gap-5" onsubmit={save} novalidate {@attach revealErrors}>
			{#if status === 'theirs' && base}
				<p aria-live="polite" class={noticeClass}>
					This is {base.updatedBy}'s version. Change it and save, or close to keep it.
				</p>
			{/if}

			{#if choosable.length > 1}
				<fieldset class="flex flex-col gap-2">
					<legend class="mb-2 font-bold">Dog</legend>
					<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Dog">
						{#each choosable as d (d.id)}
							{@const on = values.dogId === d.id}
							<button
								type="button"
								role="radio"
								aria-checked={on}
								class={[chip, 'gap-2 pl-1', chipState(on)]}
								aria-describedby={errors.dogId ? 'event-dog-error' : undefined}
								onclick={() => {
									values.dogId = d.id;
									edited('dogId');
								}}
							>
								<DogAvatar dog={d} size={36} />
								{d.name}
							</button>
						{/each}
					</div>
					{#if errors.dogId}
						<p id="event-dog-error" class="text-sm text-destructive">{errors.dogId}</p>
					{/if}
				</fieldset>
			{:else if errors.dogId}
				<p class="text-sm text-destructive">{errors.dogId}</p>
			{/if}

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 font-bold">What happened</legend>
				<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="What happened">
					{#each CATEGORIES as category (category)}
						{@const on = values.category === category}
						<button
							type="button"
							role="radio"
							aria-checked={on}
							class={[chip, 'gap-2', chipState(on)]}
							aria-describedby={errors.category ? 'event-category-error' : undefined}
							onclick={() => {
								values.category = category;
								edited('category');
							}}
						>
							<Icon name={categoryLabels[category].icon} size={20} />
							{categoryLabels[category].label}
						</button>
					{/each}
				</div>
				{#if errors.category}
					<p id="event-category-error" class="text-sm text-destructive">{errors.category}</p>
				{/if}
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 font-bold">When</legend>
				{#if !editing}
					<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="When">
						{#each ['now', '15', '60', 'earlier'] as const as choice (choice)}
							{@const on = values.when === choice}
							<button
								type="button"
								role="radio"
								aria-checked={on}
								class={[chip, chipState(on)]}
								onclick={() => {
									values.when = choice;
									edited('when');
								}}
							>
								{whenLabels[choice]}
							</button>
						{/each}
					</div>
				{/if}
				{#if values.when === 'earlier'}
					<div class="grid grid-cols-2 gap-3">
						<div class="flex flex-col gap-2">
							<Label for="event-date" class="text-sm">Date</Label>
							<Input
								id="event-date"
								type="date"
								bind:value={values.date}
								oninput={() => edited('when')}
								aria-invalid={errors.when ? 'true' : undefined}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="event-time" class="text-sm">Time</Label>
							<Input
								id="event-time"
								type="time"
								bind:value={values.time}
								oninput={() => edited('when')}
								aria-invalid={errors.when ? 'true' : undefined}
							/>
						</div>
					</div>
				{/if}
				{#if errors.when}
					<p class="text-sm text-destructive">{errors.when}</p>
				{/if}
			</fieldset>

			{@render text('trigger', 'Trigger', 'What set it off, like the doorbell.', 200, false)}
			{@render text(
				'response',
				'How your puppy responded',
				'What they did, and how they settled.',
				1000,
				true
			)}
			{@render text('notes', 'Notes', 'Anything else worth remembering.', 2000, true)}

			<div class="sticky bottom-0 -mt-1 flex flex-col gap-3 bg-popover pt-3 pb-4">
				{@render alerts()}
				<Button
					type="submit"
					class="w-full"
					disabled={busy || status === 'conflict' || status === 'gone'}
				>
					{#if busy}
						<Icon name="saving" class="animate-spin" />
						Saving…
					{:else if status === 'failed'}
						Retry
					{:else}
						Save
					{/if}
				</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>
