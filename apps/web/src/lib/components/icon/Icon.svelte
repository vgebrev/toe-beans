<script lang="ts">
	// The only way the app draws an icon (ui.md §6.4). It renders the icon data itself, so icons
	// are in the server-rendered HTML (the @hugeicons/svelte component only draws them after
	// hydration). Decorative by default, hidden from screen readers; pass `label` when the icon
	// carries meaning on its own. Icon-only buttons put their aria-label on the button and
	// leave the icon decorative.
	import { icons, type IconName } from './icons.js';
	import { svgAttributes } from './svg.js';

	interface Props {
		name: IconName;
		/** Accessible name, when the icon isn't next to text that says the same. */
		label?: string;
		size?: number;
		strokeWidth?: number;
		class?: string;
	}

	let { name, label, size = 24, strokeWidth = 1.5, class: className }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	class={className}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
	data-icon={name}
>
	{#each icons[name] as [tag, attributes], index (index)}
		<svelte:element this={tag} {...svgAttributes(attributes, strokeWidth)} />
	{/each}
</svg>
