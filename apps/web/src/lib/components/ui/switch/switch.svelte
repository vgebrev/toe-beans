<script lang="ts">
	// Toe Beans: a 28 × 48 px track (the generated one was 18 × 32), styled through bits-ui's
	// `data-state`, which this version sets rather than `data-checked`. The pseudo-element widens
	// the touch target to 48 px high; a row label (`for`) usually makes the whole row tappable.
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		'peer group/switch relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors outline-none after:absolute after:-inset-x-1 after:-inset-y-2.5 focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50',
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="pointer-events-none block size-6 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
	/>
</SwitchPrimitive.Root>
