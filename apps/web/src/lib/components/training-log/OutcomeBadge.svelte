<script lang="ts">
	// An outcome as a badge (ui.md §6.4): an icon and a text label on its tint. Practice isn't
	// performance, so *Not yet* is blue, never red, and *Not assessed* is neutral and outlined.
	import type { Outcome } from '@toe-beans/contracts';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { outcomeLabels } from '#lib/training-log/labels.js';

	interface Props {
		outcome: Outcome;
		/** The short label, for cards. */
		short?: boolean;
	}

	let { outcome, short = false }: Props = $props();
	const label = $derived(outcomeLabels[outcome]);
	const tones: Record<Outcome, string> = {
		successful: 'bg-success text-success-foreground',
		partial: 'bg-partial text-partial-foreground',
		not_yet: 'bg-not-yet text-not-yet-foreground',
		not_assessed: 'border border-not-assessed-border text-muted-foreground'
	};
</script>

<span
	class={[
		'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold',
		tones[outcome]
	]}
>
	<Icon name={label.icon} size={16} />
	{#if short && label.short !== label.full}
		<span aria-hidden="true">{label.short}</span><span class="sr-only">{label.full}</span>
	{:else}
		{label.full}
	{/if}
</span>
