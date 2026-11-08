<script lang="ts">
	// Toe Beans: 16 px text at every width so Chrome never zooms in on focus, and the input's
	// radius and padding (ui.md §6.4).
	import { cn, type WithElementRef, type WithoutChildren } from '#lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		'data-slot': dataSlot = 'textarea',
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		'flex field-sizing-content min-h-24 w-full rounded-xl border border-input bg-transparent px-4 py-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
		className
	)}
	bind:value
	{...restProps}></textarea>
