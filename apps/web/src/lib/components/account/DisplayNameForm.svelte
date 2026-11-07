<script lang="ts">
	// The name the household sees, on More → Account (ui.md §4.7). Saving follows ui.md §5.2: the
	// typed name survives any failure, a conflict offers both versions, and "Saved" only shows
	// once the server has it (NFR-04, NFR-13).
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Profile } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { createApiClient, type ApiError } from '#lib/api-client/index.js';

	interface Props {
		displayName: string;
		etag: string;
		/**
		 * Onboarding (ui.md J1 step 2): the button reads Continue, and saves even an unchanged name,
		 * which confirms it as the person's choice so that a later sign-in leaves it alone.
		 */
		onconfirmed?: () => void;
	}

	let props: Props = $props();

	const api = createApiClient((input, init) => fetch(input, init));

	// What the server has, and what's in the field. Seeded once: after a save the page's data
	// reloads, and the field must keep what's in it rather than jump.
	const initial = untrack(() => ({ displayName: props.displayName, etag: props.etag }));
	let saved = $state(initial);
	let value = $state(initial.displayName);
	let status = $state<'idle' | 'saving' | 'saved' | 'failed' | 'conflict' | 'signed-out'>('idle');
	let fieldError = $state<string | null>(null);

	const changed = $derived(value.trim() !== saved.displayName);
	const confirming = $derived(props.onconfirmed !== undefined);
	const canSave = $derived((changed || confirming) && value.trim() !== '' && status !== 'saving');

	function edited() {
		fieldError = null;
		if (status === 'saved') status = 'idle';
	}

	async function save(event?: SubmitEvent) {
		event?.preventDefault();
		if (!canSave && status !== 'conflict') return;
		status = 'saving';
		fieldError = null;
		const result = await api.send('PATCH', '/me', {
			body: { displayName: value },
			ifMatch: saved.etag,
			schema: Profile
		});
		if (result.ok) {
			saved = { displayName: result.data.displayName, etag: result.etag ?? saved.etag };
			value = result.data.displayName;
			status = 'saved';
			// The viewer in the layout carries the name too.
			await invalidateAll();
			props.onconfirmed?.();
			return;
		}
		failed(result.error);
	}

	function failed(error: ApiError) {
		if (error.kind === 'problem') {
			const { status: code, errors } = error.problem;
			if (code === 400) {
				fieldError = errors?.['displayName']?.[0] ?? 'Check the name and try again.';
				status = 'idle';
				return;
			}
			if (code === 409 || code === 412) {
				status = 'conflict';
				return;
			}
			if (code === 401) {
				status = 'signed-out';
				return;
			}
		}
		status = 'failed';
	}

	/** The newer version from the server; with `keepMine`, saves the typed name over it. */
	async function reload(keepMine: boolean) {
		status = 'saving';
		const result = await api.get('/me', Profile);
		if (!result.ok || !result.etag) return failed(result.ok ? { kind: 'network' } : result.error);
		saved = { displayName: result.data.displayName, etag: result.etag };
		if (!keepMine) {
			value = result.data.displayName;
			status = 'idle';
			return;
		}
		status = 'idle';
		await save();
	}
</script>

<form class="flex flex-col gap-2" onsubmit={save} novalidate>
	<Label for="display-name" class="font-bold">Your name</Label>
	<Input
		id="display-name"
		name="displayName"
		autocomplete="name"
		maxlength={100}
		bind:value
		oninput={edited}
		aria-invalid={fieldError ? 'true' : undefined}
		aria-describedby={fieldError ? 'display-name-error' : 'display-name-hint'}
	/>
	{#if fieldError}
		<p id="display-name-error" class="text-sm text-destructive">{fieldError}</p>
	{:else}
		<p id="display-name-hint" class="text-sm text-muted-foreground">
			Everyone in your household sees this name.
		</p>
	{/if}

	{#if status === 'failed'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			Couldn't save — check your connection.
		</p>
	{:else if status === 'signed-out'}
		<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
			You've been signed out. Sign in again, then save your name.
		</p>
	{:else if status === 'conflict'}
		<div
			role="alert"
			class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-3"
		>
			<p>Your name was changed somewhere else a moment ago.</p>
			<div class="flex flex-wrap gap-2">
				<Button type="button" variant="outline" onclick={() => reload(false)}>
					See the new name
				</Button>
				<Button type="button" onclick={() => reload(true)}>Keep mine</Button>
			</div>
		</div>
	{/if}

	<div class="flex items-center gap-3">
		<Button
			type="submit"
			disabled={!canSave || status === 'conflict'}
			class={confirming ? 'w-full' : undefined}
		>
			{#if status === 'saving'}
				<Icon name="saving" class="animate-spin" />
				Saving…
			{:else if status === 'failed'}
				Retry
			{:else}
				{confirming ? 'Continue' : 'Save'}
			{/if}
		</Button>
		<p aria-live="polite" class="flex items-center gap-1 text-sm text-muted-foreground">
			{#if status === 'saved' && !confirming}
				<Icon name="done" size={20} />
				Saved
			{/if}
		</p>
	</div>
</form>
