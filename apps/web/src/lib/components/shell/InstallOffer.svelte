<script lang="ts">
	// What installing looks like from here (ui.md §6.3): the browser's dialog on a tap when it
	// offers one, otherwise where to find *Install* in the browser's menu. Nothing once running
	// as the app. Notifications and onboarding use it; Today has its own one-line banner.
	import { install } from '#lib/client/install.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';

	interface Props {
		/** Why install, in a sentence. */
		reason: string;
	}

	let { reason }: Props = $props();
</script>

{#if install.state === 'available'}
	<div class="flex flex-col gap-3">
		<p class="text-sm text-muted-foreground">{reason}</p>
		<Button onclick={() => install.prompt()}>Install Toe Beans</Button>
	</div>
{:else if install.state === 'installed'}
	<p role="status" class="text-sm">
		Installed. Open Toe Beans from your home screen or apps list from now on.
	</p>
{:else if install.state === 'manual'}
	<p class="text-sm text-muted-foreground">
		{reason} Use your browser's <strong>Install</strong> or <strong>Add to Home screen</strong> option,
		then open Toe Beans from there.
	</p>
{/if}
