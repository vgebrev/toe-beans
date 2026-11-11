<script lang="ts">
	// The quick log (ui.md §4.2, FR-07): how it went, with *Not assessed* chosen, so a log never
	// claims success; *Add details* (mood, place, minutes, notes), collapsed unless the person
	// prefers it open; and when. Everything but the dog and the exercise is optional, so Save is
	// one tap. The same sheet edits a log (§3 J8). Saving follows §5.2: what's chosen survives a
	// failure, and a change made elsewhere is never overwritten; *See their version* loads it.
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { SessionLog, type Dog, type PlannedSession } from '@toe-beans/contracts';
	import DogAvatar from '#lib/components/dogs/DogAvatar.svelte';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { createApiClient, type ApiError } from '#lib/api-client/index.js';
	import {
		DURATION_MAX,
		MOODS,
		moodLabels,
		OUTCOMES,
		outcomeLabels,
		PLACES,
		placeLabels
	} from '#lib/training-log/labels.js';
	import { practisedAt, whenLabels, zonedParts, type WhenChoice } from '#lib/training-log/when.js';

	type Target =
		| { kind: 'session'; session: PlannedSession }
		| { kind: 'exercise'; exercise: { id: string; title: string; minutes?: number | undefined } }
		| { kind: 'log'; log: SessionLog };

	interface Props {
		open: boolean;
		/** A planned session or an exercise to log, or a log to edit. */
		target: Target;
		/** The household's dogs, archived ones too, so a log can name its dog. */
		dogs: readonly Dog[];
		/** The dog to start with when logging an exercise. */
		dogId?: string | null | undefined;
		timeZone: string;
		/** Once it's saved. The sheet has closed. */
		onfinished: (log: SessionLog) => void | Promise<void>;
	}

	let { open = $bindable(), target, dogs, dogId = null, timeZone, onfinished }: Props = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	const DETAILS_KEY = 'toe-beans:log-details-open';

	// The sheet is remounted each time it opens, so it starts from what it was given.
	const initial = untrack(() => target);
	const editing = initial.kind === 'log';
	const exercise =
		initial.kind === 'session'
			? initial.session.exercise
			: initial.kind === 'log'
				? initial.log.exercise
				: initial.exercise;
	const fixedDogId =
		initial.kind === 'session'
			? initial.session.dogId
			: initial.kind === 'log'
				? initial.log.dogId
				: null;
	const choosable = untrack(() => dogs.filter((d) => !d.archived));

	interface Values {
		dogId: string | null;
		outcome: SessionLog['outcome'];
		mood: SessionLog['emotionalState'] | null;
		place: SessionLog['environment'] | null;
		placeNote: string;
		minutes: number | null;
		notes: string;
		when: WhenChoice;
		date: string;
		time: string;
	}

	function valuesOf(log: SessionLog | null): Values {
		const at = zonedParts(log ? new Date(log.practisedAt) : new Date(), timeZone);
		return {
			dogId:
				fixedDogId ?? untrack(() => dogId) ?? (choosable.length === 1 ? choosable[0]!.id : null),
			outcome: log?.outcome ?? 'not_assessed',
			mood: log?.emotionalState ?? null,
			place: log?.environment ?? null,
			placeNote: log?.environmentNote ?? '',
			minutes: log?.durationMin ?? null,
			notes: log?.notes ?? '',
			when: log ? 'earlier' : 'now',
			date: at.date,
			time: at.time
		};
	}

	const initialLog = initial.kind === 'log' ? initial.log : null;
	let base = $state<SessionLog | null>(initialLog);
	let values = $state(valuesOf(initialLog));
	let status = $state<
		'idle' | 'saving' | 'failed' | 'signed-out' | 'conflict' | 'theirs' | 'gone' | 'refused'
	>('idle');
	/** Why the server refused to log it, such as the session being logged meanwhile. */
	let refusal = $state('');
	let theirs = $state<SessionLog | null>(null);
	let errors = $state<
		Partial<Record<'dogId' | 'when' | 'minutes' | 'placeNote' | 'notes', string>>
	>({});

	function storedDetailsOpen(): boolean {
		try {
			return localStorage.getItem(DETAILS_KEY) === 'true';
		} catch {
			return false;
		}
	}
	const hasDetails = (v: Values) =>
		v.mood !== null || v.place !== null || v.minutes !== null || v.notes.trim() !== '';
	let detailsOpen = $state(hasDetails(valuesOf(initialLog)) || storedDetailsOpen());
	function toggleDetails() {
		detailsOpen = !detailsOpen;
		try {
			localStorage.setItem(DETAILS_KEY, String(detailsOpen));
		} catch {
			// Not remembered, which only costs a tap next time.
		}
	}

	const busy = $derived(status === 'saving');
	const dog = $derived(dogs.find((d) => d.id === values.dogId));
	const outcomeName = 'log-outcome';

	function check(): boolean {
		const next: typeof errors = {};
		if (!values.dogId) next.dogId = 'Choose which dog practised.';
		if (values.when === 'earlier' && (!values.date || !values.time)) {
			next.when = 'Choose the date and time.';
		}
		errors = next;
		return Object.keys(next).length === 0;
	}

	const optional = (v: string) => (v.trim() === '' ? null : v);

	function body() {
		// An edit sends the time only when it was changed, so saving keeps the logged instant.
		const logged = base && zonedParts(new Date(base.practisedAt), timeZone);
		const moved = !logged || logged.date !== values.date || logged.time !== values.time;
		const at = moved ? practisedAt(values.when, values, timeZone) : undefined;
		const details = {
			outcome: values.outcome,
			durationMin: values.minutes,
			emotionalState: values.mood,
			environment: values.place,
			environmentNote: values.place ? optional(values.placeNote) : null,
			notes: optional(values.notes)
		};
		if (editing) return { ...details, ...(at && { practisedAt: at }) };
		// Unset details are left out of a new log rather than sent as null.
		const set = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== null));
		const subject =
			initial.kind === 'session'
				? { plannedSessionId: initial.session.id }
				: { dogId: values.dogId, exerciseId: exercise.id };
		return { ...subject, ...set, ...(at && { practisedAt: at }) };
	}

	async function save(event?: SubmitEvent) {
		event?.preventDefault();
		if (busy || !check()) return;
		status = 'saving';
		const result = base
			? await api.send('PATCH', `/session-logs/${base.id}`, {
					body: body(),
					ifMatch: base.etag,
					schema: SessionLog
				})
			: await api.send('POST', '/session-logs', { body: body(), schema: SessionLog });
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
			const { status: code, errors: fields, detail } = error.problem;
			if (code === 400 && fields) {
				errors = {
					dogId: fields['dogId']?.[0] ?? fields['exerciseId']?.[0],
					when: fields['practisedAt']?.[0],
					minutes: fields['durationMin']?.[0],
					placeNote: fields['environmentNote']?.[0] ?? fields['environment']?.[0],
					notes: fields['notes']?.[0] ?? fields['outcome']?.[0] ?? fields['emotionalState']?.[0]
				};
				if (errors.minutes || errors.placeNote || errors.notes) detailsOpen = true;
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
			if (code === 409 || code === 412) {
				refusal = detail ?? 'This session changed a moment ago.';
				status = 'refused';
				return;
			}
		}
		status = 'failed';
	}

	async function conflicted() {
		const latest = await api.get(`/session-logs/${base!.id}`, SessionLog);
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

	function edited() {
		if (status === 'theirs') status = 'idle';
	}

	function step(by: number) {
		const minutes = values.minutes;
		if (minutes === null) {
			if (by > 0) values.minutes = Math.min(exercise.minutes ?? 5, DURATION_MAX);
		} else {
			const next = minutes + by;
			values.minutes = next < 1 ? null : Math.min(next, DURATION_MAX);
		}
		errors = { ...errors, minutes: undefined };
		edited();
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
			{initial.kind === 'session'
				? 'This session was removed a moment ago, so it can’t be logged.'
				: initial.kind === 'log'
					? 'This log was deleted a moment ago.'
					: 'That dog or exercise isn’t available any more.'}
		</p>
	{:else if status === 'refused'}
		<p role="alert" class={noticeClass}>{refusal}</p>
	{:else if status === 'conflict' && theirs}
		<div role="alert" class="flex flex-col gap-3 {noticeClass}">
			<p>{theirs.updatedBy} changed this a moment ago.</p>
			<Button type="button" variant="outline" onclick={seeTheirs}>See their version</Button>
		</div>
	{/if}
{/snippet}

{#snippet toggles<T extends string>(
	legend: string,
	options: readonly T[],
	labels: Record<T, { short: string; full: string }>,
	selected: T | null,
	choose: (value: T | null) => void
)}
	<fieldset class="flex flex-col gap-2">
		<legend class="mb-2 font-bold">
			{legend} <span class="font-normal text-muted-foreground">(optional)</span>
		</legend>
		<div class="flex flex-wrap gap-2">
			{#each options as option (option)}
				{@const on = selected === option}
				<button
					type="button"
					class={[chip, chipState(on)]}
					aria-pressed={on}
					aria-label={labels[option].full}
					onclick={() => {
						choose(on ? null : option);
						edited();
					}}
				>
					{labels[option].short}
				</button>
			{/each}
		</div>
	</fieldset>
{/snippet}

<Sheet.Root bind:open>
	<!-- The person came to tap Save; raising the keyboard would cover it. -->
	<Sheet.Content
		side="bottom"
		onOpenAutoFocus={(e) => e.preventDefault()}
		class="mx-auto flex max-h-[92dvh] max-w-xl flex-col gap-4 overflow-y-auto px-4 pt-6 pb-0"
	>
		<Sheet.Header class="p-0 pr-12 text-left">
			<Sheet.Title class="font-display text-xl font-semibold">
				{editing ? 'Edit log' : 'Log practice'}
			</Sheet.Title>
			<Sheet.Description class="flex items-center gap-2 text-base text-foreground">
				{#if dog && (fixedDogId || choosable.length === 1)}
					<DogAvatar {dog} size={28} />
					<span><span class="font-bold">{dog.name}</span> · {exercise.title}</span>
				{:else}
					{exercise.title}
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		<form class="flex flex-col gap-5" onsubmit={save} novalidate>
			{#if status === 'theirs' && base}
				<p aria-live="polite" class={noticeClass}>
					This is {base.updatedBy}'s version. Change it and save, or close to keep it.
				</p>
			{/if}

			{#if !fixedDogId && choosable.length > 1}
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
								aria-describedby={errors.dogId ? 'log-dog-error' : undefined}
								onclick={() => {
									values.dogId = d.id;
									errors = { ...errors, dogId: undefined };
								}}
							>
								<DogAvatar dog={d} size={36} />
								{d.name}
							</button>
						{/each}
					</div>
					{#if errors.dogId}
						<p id="log-dog-error" class="text-sm text-destructive">{errors.dogId}</p>
					{/if}
				</fieldset>
			{:else if errors.dogId}
				<p class="text-sm text-destructive">{errors.dogId}</p>
			{/if}

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 font-bold">
					How did it go? <span class="font-normal text-muted-foreground">(optional)</span>
				</legend>
				<!-- Each option is as wide as its label, sharing what's left, so *Not assessed* stays on one
				     line on a 384 px phone; icons sit on one line at the top even if a label must wrap. -->
				<div class="flex gap-1 rounded-2xl bg-soft p-1">
					{#each OUTCOMES as outcome (outcome)}
						{@const label = outcomeLabels[outcome]}
						<label
							class={[
								'flex min-h-14 flex-auto cursor-pointer flex-col items-center justify-start gap-0.5 rounded-xl px-2 pt-2 pb-1.5 text-center text-sm leading-tight font-bold has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
								values.outcome === outcome
									? 'bg-primary text-primary-foreground'
									: 'text-foreground'
							]}
						>
							<input
								type="radio"
								name={outcomeName}
								value={outcome}
								class="sr-only"
								bind:group={values.outcome}
								onchange={edited}
								aria-label={label.full}
							/>
							<Icon name={label.icon} size={20} />
							<span aria-hidden="true">{label.short}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<Button
				type="button"
				variant="ghost"
				class="-mx-2 self-start px-2"
				aria-expanded={detailsOpen}
				aria-controls="log-details"
				onclick={toggleDetails}
			>
				<Icon name={detailsOpen ? 'back' : 'forward'} class={detailsOpen ? '-rotate-90' : ''} />
				Add details
			</Button>

			<div id="log-details" class="flex flex-col gap-5" hidden={!detailsOpen}>
				{@render toggles('Mood', MOODS, moodLabels, values.mood ?? null, (v) => (values.mood = v))}
				{#if values.mood === 'stressed'}
					<p class="rounded-2xl bg-soft px-4 py-3">
						Short, easy sessions help a stressed puppy. Next time, try
						<!-- A new tab, so following it never loses what's chosen here; resolved, plus an anchor. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							class="font-bold text-primary underline"
							href={`${resolve('/(app)/library/[id]', { id: exercise.id })}#if-struggling`}
							target="_blank">If your puppy struggles</a
						>.
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</p>
				{/if}

				{@render toggles(
					'Where',
					PLACES,
					placeLabels,
					values.place ?? null,
					(v) => (values.place = v)
				)}
				{#if values.place}
					<div class="flex flex-col gap-2">
						<Label for="log-place-note" class="font-bold">
							Which place <span class="font-normal text-muted-foreground">(optional)</span>
						</Label>
						<Input
							id="log-place-note"
							autocomplete="off"
							maxlength={100}
							bind:value={values.placeNote}
							oninput={edited}
							aria-invalid={errors.placeNote ? 'true' : undefined}
							aria-describedby={errors.placeNote ? 'log-place-note-error' : undefined}
						/>
						{#if errors.placeNote}
							<p id="log-place-note-error" class="text-sm text-destructive">{errors.placeNote}</p>
						{/if}
					</div>
				{/if}

				<div class="flex flex-col gap-2">
					<span id="log-minutes-label" class="font-bold">
						Duration <span class="font-normal text-muted-foreground">(optional)</span>
					</span>
					<div class="flex items-center gap-3" role="group" aria-labelledby="log-minutes-label">
						<Button
							type="button"
							variant="outline"
							size="icon"
							aria-label="Fewer minutes"
							onclick={() => step(-1)}
						>
							<Icon name="minus" />
						</Button>
						<output class="min-w-24 text-center font-bold tabular-nums" aria-live="polite">
							{values.minutes === null ? 'Not set' : `${values.minutes} min`}
						</output>
						<Button
							type="button"
							variant="outline"
							size="icon"
							aria-label="More minutes"
							onclick={() => step(1)}
						>
							<Icon name="plus" />
						</Button>
					</div>
					{#if errors.minutes}
						<p class="text-sm text-destructive">{errors.minutes}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-2">
					<Label for="log-notes" class="font-bold">
						Notes <span class="font-normal text-muted-foreground">(optional)</span>
					</Label>
					<Textarea
						id="log-notes"
						class="min-h-16"
						maxlength={2000}
						bind:value={values.notes}
						oninput={edited}
						aria-invalid={errors.notes ? 'true' : undefined}
						aria-describedby={errors.notes ? 'log-notes-error' : undefined}
					/>
					{#if errors.notes}
						<p id="log-notes-error" class="text-sm text-destructive">{errors.notes}</p>
					{/if}
				</div>
			</div>

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
									errors = { ...errors, when: undefined };
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
							<Label for="log-date" class="text-sm">Date</Label>
							<Input
								id="log-date"
								type="date"
								bind:value={values.date}
								oninput={edited}
								aria-invalid={errors.when ? 'true' : undefined}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="log-time" class="text-sm">Time</Label>
							<Input
								id="log-time"
								type="time"
								bind:value={values.time}
								oninput={edited}
								aria-invalid={errors.when ? 'true' : undefined}
							/>
						</div>
					</div>
				{/if}
				{#if errors.when}
					<p class="text-sm text-destructive">{errors.when}</p>
				{/if}
			</fieldset>

			<div class="sticky bottom-0 -mt-1 flex flex-col gap-3 bg-popover pt-3 pb-4">
				{@render alerts()}
				<Button
					type="submit"
					class="w-full"
					disabled={busy || status === 'conflict' || status === 'gone' || status === 'refused'}
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
