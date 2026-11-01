<script lang="ts">
	// The Toe Beans mark, optionally with the wordmark (ui.md §6.4). PLACEHOLDER paw from the
	// mock-ups until the AI-assisted logo lands (src/lib/assets/brand/README.md). Drawn in
	// currentColor; the default class colours it primary.
	interface Props {
		/** Show "Toe Beans" beside the mark. */
		wordmark?: boolean;
		/** Mark size in px. */
		size?: number;
		class?: string;
	}

	let { wordmark = false, size = 32, class: className = 'text-primary' }: Props = $props();
</script>

<span class="inline-flex items-center gap-2.5 {className}">
	<svg
		width={size}
		height={size}
		viewBox="0 0 64 64"
		fill="currentColor"
		role={wordmark ? undefined : 'img'}
		aria-label={wordmark ? undefined : 'Toe Beans'}
		aria-hidden={wordmark ? 'true' : undefined}
	>
		<ellipse cx="32" cy="43" rx="15" ry="12.5" />
		<ellipse cx="13" cy="27" rx="6" ry="7.5" />
		<ellipse cx="24" cy="14" rx="6.5" ry="8" />
		<ellipse cx="40" cy="14" rx="6.5" ry="8" />
		<ellipse cx="51" cy="27" rx="6" ry="7.5" />
	</svg>
	{#if wordmark}
		<span class="font-display text-2xl font-semibold text-foreground">Toe Beans</span>
	{/if}
</span>
