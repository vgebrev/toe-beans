<script lang="ts">
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

{@render children()}

<style>
	:global(:root) {
		color-scheme: light dark;
		--bg: #fffbf5;
		--surface: #ffffff;
		--text: #2b1d14;
		--muted: #6b5444;
		--primary: #8a4b1f;
		--on-primary: #ffffff;
		--border: #e6d8c6;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #141110;
			--surface: #211c18;
			--text: #f3eadf;
			--muted: #b5a493;
			--primary: #c98a4b;
			--on-primary: #1a110a;
			--border: #3a312a;
		}
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font: 16px/1.5 system-ui, sans-serif;
	}
</style>
