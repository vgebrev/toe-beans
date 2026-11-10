<script lang="ts">
	// Adding or editing a cue in a bottom sheet (ui.md §4.6). Saving follows §5.2: nothing typed is
	// lost on a failure, and a change made elsewhere is never overwritten without asking. Cues are
	// simple records, so the conflict offers *Overwrite with mine* beside *See their version*.
	// Deleting is confirmed in the same sheet, naming the cue (§5.3).
	import { untrack } from 'svelte';
	import { Cue } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { createApiClient, type ApiError } from '#lib/api-client/index.js';

	interface Props {
		open: boolean;
		/** The cue being edited; adding a new one without it. */
		cue?: Cue | null;
		/** Once something was saved or deleted, with what to say about it. The sheet has closed. */
		onfinished: (message: string) => void | Promise<void>;
	}

	let { open = $bindable(), cue = null, onfinished }: Props = $props();

	const api = createApiClient((input, init) => fetch(input, init));

	type Fields = Record<'label' | 'meaning' | 'handSignal' | 'rewardConvention' | 'notes', string>;
	const fieldsOf = (c: Cue | null): Fields => ({
		label: c?.label ?? '',
		meaning: c?.meaning ?? '',
		handSignal: c?.handSignal ?? '',
		rewardConvention: c?.rewardConvention ?? '',
		notes: c?.notes ?? ''
	});

	// The sheet is remounted for each cue, so it starts from the one it was given. `base` is the
	// version an edit is based on: null when adding, or after the cue was deleted elsewhere.
	const initial = untrack(() => cue);
	let base = $state<Cue | null>(initial);
	let values = $state(fieldsOf(initial));
	let view = $state<'form' | 'confirm-delete'>('form');
	let status = $state<
		'idle' | 'saving' | 'unchanged' | 'failed' | 'signed-out' | 'conflict' | 'gone' | 'theirs'
	>('idle');
	/** The newer version saved elsewhere, while a conflict is shown. */
	let theirs = $state<Cue | null>(null);
	let errors = $state<Partial<Fields>>({});

	const trimmed = (f: Fields) =>
		Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) as Fields;
	const changed = $derived(
		base === null || JSON.stringify(trimmed(values)) !== JSON.stringify(fieldsOf(base))
	);
	const busy = $derived(status === 'saving');
	const name = $derived(base?.label ?? initial?.label ?? 'this cue');

	function check(): boolean {
		const next: Partial<Fields> = {};
		if (values.label.trim() === '') next.label = 'Enter the cue word.';
		if (values.meaning.trim() === '') next.meaning = 'Say what your dog does on this cue.';
		errors = next;
		return Object.keys(next).length === 0;
	}

	const optional = (v: string) => (v.trim() === '' ? null : v);
	const body = () => ({
		label: values.label,
		meaning: values.meaning,
		handSignal: optional(values.handSignal),
		rewardConvention: optional(values.rewardConvention),
		notes: optional(values.notes)
	});

	async function finish(message: string) {
		open = false;
		await onfinished(message);
	}

	async function save(event?: SubmitEvent) {
		event?.preventDefault();
		if (busy || !check()) return;
		if (!changed && status !== 'conflict') {
			status = 'unchanged';
			return;
		}
		status = 'saving';
		const result = base
			? await api.send('PATCH', `/cues/${base.id}`, {
					body: body(),
					ifMatch: base.etag,
					schema: Cue
				})
			: await api.send('POST', '/cues', { body: body(), schema: Cue });
		if (result.ok) {
			status = 'idle';
			await finish(base ? `Saved “${result.data.label}”.` : `Added “${result.data.label}”.`);
			return;
		}
		await failed(result.error);
	}

	/** Field errors, a conflict, or a cue deleted meanwhile each get their own say. */
	async function failed(error: ApiError) {
		if (error.kind === 'problem') {
			const { status: code, errors: fields } = error.problem;
			if (code === 400 && fields) {
				errors = {
					label: fields['label']?.[0],
					meaning: fields['meaning']?.[0],
					handSignal: fields['handSignal']?.[0],
					rewardConvention: fields['rewardConvention']?.[0],
					notes: fields['notes']?.[0]
				};
				status = 'idle';
				return;
			}
			if (code === 400) {
				errors = { label: error.problem.detail ?? error.problem.title };
				status = 'idle';
				return;
			}
			if (code === 401) {
				status = 'signed-out';
				return;
			}
			if (code === 404 && base) {
				status = 'gone';
				return;
			}
			if (code === 412 && base) return conflicted();
		}
		status = 'failed';
	}

	/** Fetches the newer version, so the conflict can say who changed it and show theirs. */
	async function conflicted() {
		const latest = await api.get(`/cues/${base!.id}`, Cue);
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
		values = fieldsOf(theirs);
		errors = {};
		theirs = null;
		view = 'form';
		status = 'theirs';
	}

	async function overwrite() {
		if (!theirs) return;
		base = theirs;
		theirs = null;
		await save();
	}

	/** It was deleted elsewhere: what's typed becomes a new cue. */
	async function addAgain() {
		base = null;
		await save();
	}

	async function remove() {
		if (busy || !base) return;
		status = 'saving';
		const result = await api.send('DELETE', `/cues/${base.id}`, { ifMatch: base.etag });
		if (result.ok) {
			status = 'idle';
			await finish(`Deleted “${base.label}”.`);
			return;
		}
		const code = result.error.kind === 'problem' ? result.error.problem.status : null;
		if (code === 404) return finish(`“${base.label}” was already deleted.`);
		if (code === 412) return conflicted();
		if (code === 401) {
			status = 'signed-out';
			return;
		}
		status = 'failed';
	}

	function edited(field: keyof Fields) {
		return () => {
			errors = { ...errors, [field]: undefined };
			if (status === 'unchanged' || status === 'theirs') status = 'idle';
		};
	}
	const describedBy = (field: keyof Fields, hint?: string) =>
		errors[field] ? `cue-${field}-error` : hint;
</script>

{#snippet field(
	key: keyof Fields,
	label: string,
	options: { optional?: boolean; hint?: string; max: number; multiline?: boolean }
)}
	<div class="flex flex-col gap-2">
		<Label for="cue-{key}" class="font-bold">
			{label}
			{#if options.optional}<span class="font-normal text-muted-foreground">(optional)</span>{/if}
		</Label>
		{#if options.multiline}
			<Textarea
				id="cue-{key}"
				class="min-h-16"
				maxlength={options.max}
				bind:value={values[key]}
				oninput={edited(key)}
				aria-invalid={errors[key] ? 'true' : undefined}
				aria-describedby={describedBy(key, options.hint && `cue-${key}-hint`)}
			/>
		{:else}
			<Input
				id="cue-{key}"
				autocomplete="off"
				maxlength={options.max}
				bind:value={values[key]}
				oninput={edited(key)}
				aria-invalid={errors[key] ? 'true' : undefined}
				aria-describedby={describedBy(key, options.hint && `cue-${key}-hint`)}
			/>
		{/if}
		{#if errors[key]}
			<p id="cue-{key}-error" class="text-sm text-destructive">{errors[key]}</p>
		{:else if options.hint}
			<p id="cue-{key}-hint" class="text-sm text-muted-foreground">{options.hint}</p>
		{/if}
	</div>
{/snippet}

{#snippet alerts()}
	{#if status === 'failed'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-base">
			{view === 'form' ? "Couldn't save" : "Couldn't delete"} — check your connection.
		</p>
	{:else if status === 'signed-out'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3 text-base">
			You've been signed out. Sign in again, then try again.
		</p>
	{:else if status === 'gone'}
		<div
			role="alert"
			class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-3 text-base"
		>
			<p>Someone deleted this cue a moment ago.</p>
			{#if view === 'form'}
				<Button type="button" variant="outline" onclick={addAgain}>Add it again</Button>
			{/if}
		</div>
	{:else if status === 'conflict' && theirs}
		<div
			role="alert"
			class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-3 text-base"
		>
			<p>
				{theirs.updatedBy} changed this a moment ago{view === 'form'
					? ''
					: ', so nothing was deleted'}.
			</p>
			<div class="flex flex-wrap gap-2">
				<Button type="button" variant="outline" onclick={seeTheirs}>See their version</Button>
				{#if view === 'form'}
					<Button type="button" onclick={overwrite}>Overwrite with mine</Button>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

<Sheet.Root bind:open>
	<!-- Opening a cue to read it shouldn't raise the keyboard; adding one starts typing. -->
	<Sheet.Content
		side="bottom"
		onOpenAutoFocus={(e) => {
			if (initial) e.preventDefault();
		}}
		class="mx-auto flex max-h-[92dvh] max-w-xl flex-col gap-4 overflow-y-auto px-4 pt-6 pb-0"
	>
		{#if view === 'confirm-delete' && base}
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">Delete “{name}”?</Sheet.Title>
				<Sheet.Description class="text-base">
					It goes from the cue dictionary for everyone in your household.
				</Sheet.Description>
			</Sheet.Header>
			<div class="flex flex-col gap-4 pb-4">
				{@render alerts()}
				{#if status !== 'gone'}
					<Button
						variant="destructive"
						class="w-full"
						disabled={busy || status === 'conflict'}
						onclick={remove}
					>
						{#if busy}
							<Icon name="saving" class="animate-spin" />
							Deleting…
						{:else if status === 'failed'}
							Retry
						{:else}
							Delete “{name}”
						{/if}
					</Button>
				{/if}
			</div>
		{:else}
			<Sheet.Header class="p-0 pr-12 text-left">
				<Sheet.Title class="font-display text-xl font-semibold">
					{initial ? 'Edit cue' : 'Add a cue'}
				</Sheet.Title>
				<Sheet.Description class="text-base">
					Everyone in your household sees the same cues, so your puppy hears the same thing from
					each of you.
				</Sheet.Description>
			</Sheet.Header>
			<form class="flex flex-col gap-5" onsubmit={save} novalidate>
				{#if status === 'theirs' && base}
					<p aria-live="polite" class="rounded-2xl border border-border bg-soft px-4 py-3">
						This is {base.updatedBy}'s version. Change it and save, or close to keep it.
					</p>
				{/if}
				{@render field('label', 'Cue word', {
					max: 50,
					hint: 'What you say, like Sit or Leave it.'
				})}
				{@render field('meaning', 'What it means', {
					max: 500,
					multiline: true,
					hint: 'What your puppy does, and when they’re done.'
				})}
				{@render field('handSignal', 'Hand signal', { optional: true, max: 500 })}
				{@render field('rewardConvention', 'Reward', {
					optional: true,
					max: 500,
					hint: 'How and when the reward comes, like a treat at your left knee.'
				})}
				{@render field('notes', 'Notes', { optional: true, max: 2000, multiline: true })}

				{#if initial && base}
					<Button
						type="button"
						variant="ghost"
						class="self-start text-destructive"
						onclick={() => {
							status = 'idle';
							view = 'confirm-delete';
						}}
					>
						<Icon name="delete" />
						Delete this cue
					</Button>
				{/if}

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
							{initial ? 'Save cue' : 'Add cue'}
						{/if}
					</Button>
					<p aria-live="polite" class="text-sm text-muted-foreground empty:hidden">
						{status === 'unchanged' ? "Nothing's changed, so there's nothing to save." : ''}
					</p>
				</div>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
