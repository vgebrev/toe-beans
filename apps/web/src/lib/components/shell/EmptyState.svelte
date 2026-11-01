<script lang="ts">
	// What a list shows before it has anything in it: a friendly title and one line on what
	// will appear there (ui.md §1, kind tone).
	import Icon from '#lib/components/icon/Icon.svelte';
	import type { IconName } from '#lib/components/icon/icons.js';

	interface Props {
		icon: IconName;
		title: string;
		text: string;
	}

	let { icon, title, text }: Props = $props();
</script>

<section class="flex flex-col items-center gap-3 px-8 py-12 text-center">
	<span class="flex size-16 items-center justify-center rounded-full bg-soft text-primary">
		<Icon name={icon} size={32} />
	</span>
	<h2 class="font-display text-xl font-semibold">{title}</h2>
	<p class="max-w-xs text-muted-foreground">{text}</p>
</section>
