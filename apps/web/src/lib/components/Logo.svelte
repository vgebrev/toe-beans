<script lang="ts">
	// The Toe Beans mark, optionally with the wordmark (ui.md §6.4 Logo). The letters are drawn
	// in currentColor (the default class gives brown in light, cream in dark, as on the design
	// board); the toe beans and heart are always the brand tan.
	import { markHeart, markLetters, markToes, markViewBox } from '#lib/assets/brand/mark.js';

	interface Props {
		/** Show "Toe Beans" beside the mark. */
		wordmark?: boolean;
		/** Mark height in px; the width follows the mark's proportions. */
		size?: number;
		class?: string;
	}

	let {
		wordmark = false,
		size = 32,
		class: className = 'text-primary dark:text-foreground'
	}: Props = $props();

	const { width, height } = markViewBox;
</script>

<span class="inline-flex items-center gap-2.5 {className}">
	<svg
		width={(size * width) / height}
		height={size}
		viewBox="0 0 {width} {height}"
		role={wordmark ? undefined : 'img'}
		aria-label={wordmark ? undefined : 'Toe Beans'}
		aria-hidden={wordmark ? 'true' : undefined}
	>
		<path fill="currentColor" fill-rule="evenodd" d={markLetters} />
		<g class="fill-brand-accent">
			<path d={markHeart} />
			{#each markToes as toe, i (i)}
				<ellipse
					cx={toe.cx}
					cy={toe.cy}
					rx={toe.rx}
					ry={toe.ry}
					transform="rotate({toe.deg} {toe.cx} {toe.cy})"
				/>
			{/each}
		</g>
	</svg>
	{#if wordmark}
		<span class="font-display text-2xl font-bold text-foreground">Toe Beans</span>
	{/if}
</span>
