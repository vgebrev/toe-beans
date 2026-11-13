<script lang="ts">
	// *Choose dates* for History (ui.md §4.4): a start and an end date, either left blank for an
	// open end, both included. Its one button shows them (§5.1); an end before the start says so
	// under the field.
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';

	interface Props {
		open: boolean;
		from: string | null;
		to: string | null;
		/** The household's today: no later date to choose. */
		today: string;
		onchoose: (dates: { from: string | null; to: string | null }) => void;
	}

	let { open = $bindable(), from, to, today, onchoose }: Props = $props();

	// The sheet is keyed by the page, so these start from the current filter each time.
	// svelte-ignore state_referenced_locally
	let start = $state(from ?? '');
	// svelte-ignore state_referenced_locally
	let end = $state(to ?? '');
	let error = $state<string | null>(null);

	function choose(e: SubmitEvent) {
		e.preventDefault();
		if (start && end && end < start) {
			error = 'Choose an end date on or after the start.';
			return;
		}
		open = false;
		onchoose({ from: start || null, to: end || null });
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="bottom" class="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-4">
		<Sheet.Header class="p-0 pr-12 text-left">
			<Sheet.Title class="font-display text-xl font-semibold">Choose dates</Sheet.Title>
			<Sheet.Description class="text-base"
				>Leave one blank to leave that end open.</Sheet.Description
			>
		</Sheet.Header>
		<form class="flex flex-col gap-5" onsubmit={choose} novalidate>
			<div class="flex flex-col gap-2">
				<Label for="history-from">From (optional)</Label>
				<Input id="history-from" type="date" max={today} bind:value={start} />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="history-to">To (optional)</Label>
				<Input
					id="history-to"
					type="date"
					max={today}
					bind:value={end}
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? 'history-to-error' : undefined}
					oninput={() => (error = null)}
				/>
				{#if error}
					<p id="history-to-error" class="text-sm text-destructive">{error}</p>
				{/if}
			</div>
			<Button type="submit" class="w-full">Show these dates</Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
