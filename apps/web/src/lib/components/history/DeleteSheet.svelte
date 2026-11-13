<script lang="ts">
	// Confirming the delete of a log or an event (ui.md J8, §5.3): a bottom sheet naming it, whose
	// one button deletes. It's a soft delete, so History offers *Undo* afterwards. A failure keeps
	// the sheet open with *Retry*; a change made elsewhere meanwhile deletes nothing and offers the
	// changes (§5.2); one already deleted elsewhere just says so.
	import Icon from '#lib/components/icon/Icon.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { createApiClient } from '#lib/api-client/index.js';
	import { recordPath, type Deleted } from '#lib/history/deleted.js';

	interface Props {
		open: boolean;
		kind: Deleted['kind'];
		id: string;
		etag: string;
		/** "Delete Ripley's Recall basics log from today at 14:05?" */
		question: string;
		/** "Delete log" */
		confirm: string;
		/** Deleted: with the deleted version for *Undo*. */
		ondeleted: (etag: string) => void;
		/** Someone deleted it first. */
		ongone: () => void;
		/** It changed meanwhile: reload it. */
		onchanged: () => void;
	}

	let {
		open = $bindable(),
		kind,
		id,
		etag,
		question,
		confirm,
		ondeleted,
		ongone,
		onchanged
	}: Props = $props();

	const api = createApiClient((input, init) => fetch(input, init));
	let status = $state<'idle' | 'busy' | 'failed' | 'conflict' | 'signed-out'>('idle');

	async function remove() {
		if (status === 'busy') return;
		status = 'busy';
		const result = await api.send('DELETE', recordPath({ kind, id }), { ifMatch: etag });
		if (result.ok) {
			status = 'idle';
			open = false;
			ondeleted(result.etag ?? etag);
			return;
		}
		const code = result.error.kind === 'problem' ? result.error.problem.status : null;
		if (code === 404) {
			status = 'idle';
			open = false;
			ongone();
		} else if (code === 412) status = 'conflict';
		else if (code === 401) status = 'signed-out';
		else status = 'failed';
	}

	function seeChanges() {
		status = 'idle';
		open = false;
		onchanged();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
		<Sheet.Header class="p-0 pr-12 text-left">
			<Sheet.Title class="font-display text-xl font-semibold">{question}</Sheet.Title>
			<Sheet.Description class="text-base">
				It goes from History for everyone in your household. You can undo it straight after.
			</Sheet.Description>
		</Sheet.Header>
		{#if status === 'failed'}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				Couldn't delete — check your connection.
			</p>
		{:else if status === 'signed-out'}
			<p role="alert" class="rounded-2xl border border-border bg-soft px-4 py-3">
				You've been signed out. Sign in again, then try again.
			</p>
		{:else if status === 'conflict'}
			<div
				role="alert"
				class="flex flex-col gap-3 rounded-2xl border border-border bg-soft px-4 py-3"
			>
				<p>Someone changed this a moment ago, so nothing was deleted.</p>
				<Button variant="outline" onclick={seeChanges}>See the changes</Button>
			</div>
		{/if}
		{#if status !== 'conflict'}
			<Button variant="destructive" class="w-full" disabled={status === 'busy'} onclick={remove}>
				{#if status === 'busy'}
					<Icon name="saving" class="animate-spin" />
					Deleting…
				{:else if status === 'failed'}
					Retry
				{:else}
					<Icon name="delete" />
					{confirm}
				{/if}
			</Button>
		{/if}
	</Sheet.Content>
</Sheet.Root>
