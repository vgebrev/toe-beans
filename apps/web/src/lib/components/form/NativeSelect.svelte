<script lang="ts">
	// The browser's own select (its picker suits a phone), styled like Input: 48 px tall, 16 px
	// text, and the filter buttons' chevron 16 px in from the right edge in place of the browser's
	// arrow, which sits against the edge (ui.md §5.1). Options get the theme's solid surface: they'd
	// otherwise take the select's translucent dark fill, which desktop Chrome shows as grey.
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import Icon from '#lib/components/icon/Icon.svelte';
	import { cn } from '#lib/utils.js';

	interface Props extends Omit<HTMLSelectAttributes, 'children'> {
		children: Snippet;
	}

	let { value = $bindable(), class: className, children, ...restProps }: Props = $props();
</script>

<span class="relative flex w-full min-w-0">
	<select
		bind:value
		class={cn(
			'h-12 w-full min-w-0 appearance-none rounded-xl border border-input bg-background py-1 pr-11 pl-4 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [&_option]:bg-popover [&_option]:text-popover-foreground aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
			className
		)}
		{...restProps}
	>
		{@render children()}
	</select>
	<Icon
		name="expand"
		size={20}
		class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground"
	/>
</span>
