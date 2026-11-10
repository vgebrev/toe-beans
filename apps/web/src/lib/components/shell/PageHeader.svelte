<script lang="ts">
	// The top of each destination: the page title in the display font, with an optional line
	// under it, and the dog switcher on the main tabs (ui.md §2.2).
	import type { Snippet } from 'svelte';
	import DogSwitcher from '#lib/components/dogs/DogSwitcher.svelte';
	import Logo from '#lib/components/Logo.svelte';

	interface Props {
		title: string;
		/** A line under the title, such as today's date. */
		subtitle?: string;
		/** Today, Plan, History and Care show it; the pages under More don't. */
		switcher?: boolean;
		children?: Snippet;
	}

	let { title, subtitle, switcher = false, children }: Props = $props();
</script>

<header class="flex flex-col gap-3 px-4 pt-5 pb-2">
	<div>
		<!-- The logo centres on the title alone, so a subtitle doesn't move it from where the
		     other pages have it. -->
		<div class="flex items-center gap-2.5">
			<Logo size={30} />
			<h1 class="min-w-0 font-display text-[1.75rem] leading-tight font-semibold">{title}</h1>
		</div>
		{#if subtitle !== undefined}
			<!-- Always rendered when asked for, so the header doesn't jump when it fills in. Indented
			     by the logo and gap, so it lines up under the title. -->
			<p class="min-h-[1.3125rem] pl-10 text-sm text-muted-foreground">{subtitle}</p>
		{/if}
	</div>
	{#if switcher}
		<DogSwitcher />
	{/if}
	{@render children?.()}
</header>
